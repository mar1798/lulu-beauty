import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import TelegramAuthSession, User
from app.auth.security import hash_token
from app.config import settings


class AuthSessionNotFoundError(Exception):
    """Unknown id, wrong secret, or already spent — deliberately one error.

    Telling those apart would let a caller probe which session ids exist.
    """


class AuthSessionExpiredError(Exception):
    pass


class AuthSessionPendingError(Exception):
    """Nobody has confirmed it in the bot yet. The tab keeps waiting."""


class TelegramAccountNotLinkedError(Exception):
    """Telegram vouched for a person this shop has no account for.

    Only reachable from the signature-based paths (Login Widget, Mini App): those prove
    a Telegram identity but carry no phone number, and an account cannot be created
    without one. The way in is the bot, which is the only place a contact is shared.
    """


@dataclass(frozen=True)
class StartedAuthSession:
    """What the caller needs to hand out — the plaintext secrets exist only here.

    Only their digests are stored, so this is the one moment either value can be read.
    """

    session: TelegramAuthSession
    link_payload: str
    poll_secret: str


class TelegramLoginService:
    """Sign-in through the bot: the site opens a session, Telegram confirms it.

    Nothing here validates a password or a code, because the browser never proves
    anything: the proof is that the person opened the link *in their own Telegram* and,
    if the chat is new, shared a contact Telegram itself filled in.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def start(self) -> StartedAuthSession:
        # 32 bytes each: these are bearer values for the length of the login, and the
        # payload additionally has to survive being pasted around Telegram.
        link_payload = secrets.token_urlsafe(24)
        poll_secret = secrets.token_urlsafe(32)

        auth_session = TelegramAuthSession(
            link_payload=link_payload,
            poll_secret_hash=hash_token(poll_secret),
            expires_at=datetime.now(UTC) + timedelta(seconds=settings.auth_session_ttl_seconds),
        )
        self._session.add(auth_session)
        await self._session.flush()

        return StartedAuthSession(
            session=auth_session, link_payload=link_payload, poll_secret=poll_secret
        )

    def bot_url(self, link_payload: str) -> str:
        return f"https://t.me/{settings.telegram_bot_username}?start={link_payload}"

    async def attach_chat(self, link_payload: str, chat_id: int) -> TelegramAuthSession | None:
        """Binds an incoming /start to the tab that produced its link.

        Returns None for anything unusable — an expired link, a payload from a previous
        deploy, a second tap on a session already spent. The bot treats that as a plain
        /start rather than an error: the person did nothing wrong, and the worst case is
        that they link their number and sign in from the site again.
        """
        result = await self._session.execute(
            select(TelegramAuthSession).where(TelegramAuthSession.link_payload == link_payload)
        )
        auth_session = result.scalar_one_or_none()
        if auth_session is None or not self._is_open(auth_session):
            return None

        # A session binds to the first chat that opened it and to no other. The payload is
        # visible text in the chat it was pasted into, so without this a second person who
        # saw the link could tap it in *their* Telegram, share *their* contact — and the
        # tab that started the login, still polling with its own secret, would be let into
        # their account. A repeat tap from the same chat is the only legitimate re-bind.
        if auth_session.chat_id is not None and auth_session.chat_id != chat_id:
            return None

        auth_session.chat_id = chat_id
        await self._session.flush()
        return auth_session

    async def find_pending_for_chat(self, chat_id: int) -> TelegramAuthSession | None:
        """The session this chat is in the middle of, if any.

        Needed because the contact arrives in a *separate* message from the /start that
        opened the session — the chat id is the only thread between them.
        """
        result = await self._session.execute(
            select(TelegramAuthSession)
            .where(
                TelegramAuthSession.chat_id == chat_id,
                TelegramAuthSession.authorized_at.is_(None),
                TelegramAuthSession.consumed_at.is_(None),
                TelegramAuthSession.expires_at > datetime.now(UTC),
            )
            .order_by(TelegramAuthSession.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def authorize(self, auth_session: TelegramAuthSession, user: User) -> None:
        auth_session.user_id = user.id
        auth_session.authorized_at = datetime.now(UTC)
        await self._session.flush()

    async def claim(self, session_id: str, poll_secret: str) -> User:
        """The waiting tab asking whether it may come in.

        Spends the session on success: a login link is worth exactly one sign-in, and
        the tokens it produces live in cookies from then on.
        """
        auth_session = await self._find_by_secret(session_id, poll_secret)

        if auth_session.consumed_at is not None:
            raise AuthSessionNotFoundError
        if auth_session.expires_at <= datetime.now(UTC):
            raise AuthSessionExpiredError
        if auth_session.authorized_at is None or auth_session.user_id is None:
            raise AuthSessionPendingError

        user = await self._session.get(User, auth_session.user_id)
        if user is None:
            # The account was deleted between confirming and claiming.
            raise AuthSessionNotFoundError

        auth_session.consumed_at = datetime.now(UTC)
        await self._session.flush()
        return user

    async def reject(self, session_id: uuid.UUID, chat_id: int) -> uuid.UUID | None:
        """«Это не я»: the person who tapped the link disowns the sign-in it produced.

        A `/start` payload is plain text in a chat, so it can be sent to someone else —
        and until this existed, their tap authorized *the sender's* tab. The tap still
        authorizes (making it a two-step confirmation would cost every honest sign-in an
        extra press), but it is now reversible from the same message: this spends the
        session so a tab still polling gets nothing, and the caller ends the account's
        live sessions in case the tab already claimed one.

        Works on a session that is already spent or expired, which is the normal case:
        the tab claims within a second of the tap, and the person reads the warning after
        that. Nothing here revives it — `consumed_at` is restamped (harmlessly: every
        check on it is a null check, so the exact moment the tab claimed is not kept) and
        the account behind it is handed back so the caller can end its sessions.

        Returns the account to end sessions for, or None. **None is two answers at once**:
        the button no longer applies (another chat's session, or one aged out by
        `cleanup_expired`), or it applied and there was simply no account to end sessions
        for, because the session never got as far as naming one. The caller cannot tell
        them apart, so `handle_login_action` treats both as "nothing to cancel" and, on
        that branch, returns without committing — which drops the `consumed_at` written
        below. Reachable only by a callback for a session bound to this chat that was
        never authorized, and the reject button is only ever attached to an authorized
        one; splitting the return value is what this needs if that ever stops holding.
        """
        auth_session = await self._session.get(TelegramAuthSession, session_id)
        if auth_session is None or auth_session.chat_id != chat_id:
            return None
        # Spent even when no account was ever named: the session belongs to this chat,
        # and the person has just said the login is not theirs, so nothing arriving later
        # should be able to finish it — subject to the caller committing, see above.
        auth_session.consumed_at = datetime.now(UTC)
        await self._session.flush()
        return auth_session.user_id

    async def find_by_telegram_id(self, telegram_id: int) -> User:
        """The account behind a signature-proved Telegram identity.

        Matched against `telegram_chat_id` because that is where a Telegram id is stored
        here: bindings are made in a private chat, where the chat id and the user id are
        the same number (see `auth/telegram_identity`). Queried inline rather than
        through `telegram/recipients.py` so signing in doesn't depend on the bot module.
        """
        result = await self._session.execute(
            select(User).where(User.telegram_chat_id == telegram_id)
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise TelegramAccountNotLinkedError
        return user

    async def cleanup_expired(self) -> int:
        """Drops rows old enough that nothing can be done with them any more.

        Deliberately *not* "everything that can no longer be claimed". Spent and expired
        sessions used to go on the next tick, which quietly took «Это не я» with them:
        a session is spent the moment the waiting tab claims it, so within one scheduler
        interval of an honest login the button underneath it stopped revoking anything
        and started answering "отменять нечего" — exactly when the person who tapped a
        forwarded link would be reading the warning. The row is kept for
        `AUTH_SESSION_RETENTION_SECONDS` past its expiry instead; it cannot authenticate
        anyone (`claim` checks `consumed_at` and `expires_at`, `attach_chat` checks both),
        it only remembers whose sessions to end.

        The table therefore holds a day of sign-in attempts rather than one tick's worth,
        and this `DELETE` has no index to use (`expires_at` is not indexed). Both are
        deliberate at this shop's traffic — a day of logins is a handful of rows — and
        both are what to revisit first if the retention window is ever widened.
        """
        cutoff = datetime.now(UTC) - timedelta(seconds=settings.auth_session_retention_seconds)
        result = await self._session.execute(
            delete(TelegramAuthSession).where(TelegramAuthSession.expires_at <= cutoff)
        )
        # `rowcount` lives on the DBAPI cursor result, which `Result` only exposes for
        # DML — mypy types `execute()` as the general Result and can't know that.
        return int(cast("CursorResult[Any]", result).rowcount)

    async def _find_by_secret(self, session_id: str, poll_secret: str) -> TelegramAuthSession:
        # Looked up by the digest of the secret, not by id: an id alone is not proof,
        # and the id travels in the same request only to keep the index selective.
        result = await self._session.execute(
            select(TelegramAuthSession).where(
                TelegramAuthSession.poll_secret_hash == hash_token(poll_secret)
            )
        )
        auth_session = result.scalar_one_or_none()
        if auth_session is None or str(auth_session.id) != session_id:
            raise AuthSessionNotFoundError
        return auth_session

    @staticmethod
    def _is_open(auth_session: TelegramAuthSession) -> bool:
        return (
            auth_session.consumed_at is None
            and auth_session.authorized_at is None
            and auth_session.expires_at > datetime.now(UTC)
        )
