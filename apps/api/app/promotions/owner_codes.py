"""The owner's promo codes: a promotion with a `code`, entered by the customer at checkout.

An owner's code is a `Promotion` row whose `code` is set. It is never applied by itself
(`orders.active_promotions` leaves it out): it joins an order only when the customer types
it, and then as an ordinary `order_promotions` participation — which is what makes
«один раз на покупателя» the database's own guarantee (`uq_order_promotions_live_participant`).
A general code is used once by each customer; a personal one (`assigned_user_id`) once by
its one customer.

Like every service here it takes the session, mutates, and leaves the commit to the caller.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.rich_text import description_from_html
from app.catalog.service import UNIQUE_VIOLATION
from app.orders.models import Order
from app.promotions.code_errors import (
    PromoCodeAlreadyUsedError,
    PromoCodeExpiredError,
    PromoCodeNotFoundError,
    PromoCodeNotYetValidError,
    PromoCodeTakenError,
    PromoCodeUserNotFoundError,
)
from app.promotions.codes import (
    PAID_STATUSES,
    PromoCodesService,
    code_string_taken,
    generate_code,
    normalize_code,
    validate_owner_code,
)
from app.promotions.models import OrderPromotion, PromoCode, Promotion
from app.promotions.rules import AnyCodeReward, AnyCondition, dump_conditions, dump_rewards
from app.promotions.service import (
    Deletion,
    Participant,
    PromotionEndsBeforeStartError,
    PromotionsService,
)

# Tries to find a code string nobody has — a collision in 32^8 is a freak, not a loop.
_GENERATE_ATTEMPTS = 5


@dataclass(frozen=True)
class OwnerCodeDraft:
    """Everything the form sends, already parsed."""

    # None: generate one (on an update, a replacement). A string is normalised and checked.
    code: str | None
    title: str
    description_html: str | None
    starts_at: datetime
    ends_at: datetime | None
    is_enabled: bool
    assigned_user_id: uuid.UUID | None
    conditions: Sequence[AnyCondition]
    rewards: Sequence[AnyCodeReward]


class OwnerCodesService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._promotions = PromotionsService(session)

    # --- Reading --------------------------------------------------------------------------

    async def list_all(self, *, include_deleted: bool = False) -> list[Promotion]:
        query = select(Promotion).where(Promotion.code.is_not(None))
        if not include_deleted:
            query = query.where(Promotion.deleted_at.is_(None))
        query = query.order_by(
            Promotion.deleted_at.is_not(None), Promotion.created_at.desc(), Promotion.id
        )
        return list((await self._session.scalars(query)).all())

    async def get(self, promotion_id: uuid.UUID) -> Promotion:
        return await self._promotions.get(promotion_id, owner_code=True)

    async def participant_counts(self, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, int]:
        return await self._promotions.participant_counts(ids)

    async def participants(
        self, promotion_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> tuple[list[Participant], int]:
        return await self._promotions.participants(promotion_id, page, page_size, owner_code=True)

    async def users_of(self, promotions: Sequence[Promotion]) -> dict[uuid.UUID, User]:
        """The customers the personal codes belong to, in one query."""
        ids = {p.assigned_user_id for p in promotions if p.assigned_user_id is not None}
        if not ids:
            return {}
        users = (await self._session.scalars(select(User).where(User.id.in_(ids)))).all()
        return {user.id: user for user in users}

    # --- Writing --------------------------------------------------------------------------

    async def create(self, draft: OwnerCodeDraft) -> Promotion:
        await self._check(draft)
        promotion_id = uuid.uuid4()
        promotion = Promotion(
            id=promotion_id,
            # `slug` is NOT NULL unique and a code has no page: an internal one that is
            # never served (public reads leave code rows out).
            slug=f"promo-code-{promotion_id.hex}",
            announce=False,
            sort_order=0,
        )
        self._apply(promotion, draft)
        await self._flush_code(promotion, draft.code)
        return promotion

    async def update(self, promotion_id: uuid.UUID, draft: OwnerCodeDraft) -> Promotion:
        promotion = await self.get(promotion_id)
        await self._check(draft, unchanged_user_id=promotion.assigned_user_id)
        self._apply(promotion, draft)
        await self._flush_code(promotion, draft.code)
        return promotion

    async def set_enabled(self, promotion_id: uuid.UUID, is_enabled: bool) -> Promotion:
        return await self._promotions.set_enabled(promotion_id, is_enabled, owner_code=True)

    async def delete(self, promotion_id: uuid.UUID) -> Deletion:
        """Deletes a code nobody used; archives one somebody did, keeping its string taken."""
        return await self._promotions.delete(promotion_id, owner_code=True)

    # --- Applying -------------------------------------------------------------------------

    async def usable(
        self,
        user_id: uuid.UUID,
        raw: str,
        *,
        for_update: bool = False,
        except_order_id: uuid.UUID | None = None,
    ) -> Promotion:
        """The owner's code, if this customer may put it on an order now.

        Refusals come in the order issued codes give them. A missing, archived, switched-off
        or somebody else's personal code all answer `PromoCodeNotFoundError`: the API must
        not confirm that a string is a real code to anybody it is not for. `for_update`
        takes the customer's row lock (the one `refresh` takes), so two checkouts of one
        customer meet here and the second sees the first one's participation.
        `except_order_id` is an order that is allowed to already hold it (taking it back).
        """
        promotion = await self._session.scalar(
            select(Promotion).where(Promotion.code == normalize_code(raw))
        )
        if (
            promotion is None
            or promotion.deleted_at is not None
            or not promotion.is_enabled
            or (promotion.assigned_user_id is not None and promotion.assigned_user_id != user_id)
        ):
            raise PromoCodeNotFoundError
        if for_update:
            await self._session.execute(select(User.id).where(User.id == user_id).with_for_update())
        held = [
            OrderPromotion.promotion_id == promotion.id,
            OrderPromotion.user_id == user_id,
            OrderPromotion.released_at.is_(None),
        ]
        if except_order_id is not None:
            held.append(OrderPromotion.order_id != except_order_id)
        query = select(exists().where(*held))
        if await self._session.scalar(query):
            raise PromoCodeAlreadyUsedError
        now = datetime.now(UTC)
        if promotion.ends_at is not None and now >= promotion.ends_at:
            raise PromoCodeExpiredError
        if now < promotion.starts_at:
            raise PromoCodeNotYetValidError
        return promotion

    async def personal_for_user(
        self, user_id: uuid.UUID
    ) -> list[tuple[Promotion, uuid.UUID | None, bool]]:
        """The personal codes assigned to this customer that they could still see: not
        archived, and either switched on or already held by one of their orders (a code
        switched off after it was used stays in the list, as used). Each comes with the
        order that holds it, if one does, and whether that order was paid for."""
        promotions = (
            await self._session.scalars(
                select(Promotion).where(
                    Promotion.assigned_user_id == user_id,
                    Promotion.code.is_not(None),
                    Promotion.deleted_at.is_(None),
                )
            )
        ).all()
        if not promotions:
            return []
        rows = await self._session.execute(
            select(OrderPromotion.promotion_id, Order.id, Order.status)
            .join(Order, Order.id == OrderPromotion.order_id)
            .where(
                OrderPromotion.user_id == user_id,
                OrderPromotion.released_at.is_(None),
                OrderPromotion.promotion_id.in_([p.id for p in promotions]),
            )
        )
        held = {pid: (oid, status in PAID_STATUSES) for pid, oid, status in rows.tuples()}
        return [
            (p, held[p.id][0] if p.id in held else None, held[p.id][1] if p.id in held else False)
            for p in promotions
            if p.is_enabled or p.id in held
        ]

    # --- internals ------------------------------------------------------------------------

    async def _check(
        self, draft: OwnerCodeDraft, *, unchanged_user_id: uuid.UUID | None = None
    ) -> None:
        """Validates the draft. The customer is looked up only when the assignment is new:
        a code kept on a customer who has since been deleted can still be edited."""
        if draft.ends_at is not None and draft.ends_at <= draft.starts_at:
            raise PromotionEndsBeforeStartError
        await self._promotions.check_references(draft.conditions, draft.rewards)
        if draft.assigned_user_id is not None and draft.assigned_user_id != unchanged_user_id:
            found = await self._session.scalar(
                select(exists().where(User.id == draft.assigned_user_id, User.deleted_at.is_(None)))
            )
            if not found:
                raise PromoCodeUserNotFoundError

    async def _flush_code(self, promotion: Promotion, raw: str | None) -> None:
        """Gives the row its code string and flushes it.

        A manual string is checked against both kinds of code; no string means generate,
        trying a few times. A lost race for the string (the unique index) is the same
        `PromoCodeTakenError` the check gives.
        """
        if raw is not None:
            code = validate_owner_code(raw)
            if await code_string_taken(self._session, code, except_promotion_id=promotion.id):
                raise PromoCodeTakenError
            promotion.code = code
            if await self._try_flush(promotion):
                return
            raise PromoCodeTakenError
        for _ in range(_GENERATE_ATTEMPTS):
            code = generate_code()
            if await code_string_taken(self._session, code, except_promotion_id=promotion.id):
                continue
            promotion.code = code
            if await self._try_flush(promotion):
                return
        raise PromoCodeTakenError

    async def _try_flush(self, promotion: Promotion) -> bool:
        try:
            async with self._session.begin_nested():
                self._session.add(promotion)
                await self._session.flush()
        except IntegrityError as error:
            if getattr(error.orig, "sqlstate", None) != UNIQUE_VIOLATION:
                raise
            return False
        return True

    @staticmethod
    def _apply(promotion: Promotion, draft: OwnerCodeDraft) -> None:
        promotion.title = draft.title
        promotion.description_html = description_from_html(draft.description_html).html
        promotion.starts_at = draft.starts_at
        promotion.ends_at = draft.ends_at
        promotion.is_enabled = draft.is_enabled
        promotion.assigned_user_id = draft.assigned_user_id
        promotion.conditions = dump_conditions(list(draft.conditions))
        promotion.rewards = dump_rewards(list(draft.rewards))


async def resolve_code(
    session: AsyncSession, user_id: uuid.UUID, raw: str, *, for_update: bool = False
) -> PromoCode | Promotion:
    """The code the customer typed: one issued to them, or an owner's.

    A string that is not theirs issued code falls through to the owner codes; the refusal
    is the owner lookup's then. Any other refusal of an issued code (used, expired) is final:
    that string is theirs.
    """
    try:
        return await PromoCodesService(session).usable(user_id, raw, for_update=for_update)
    except PromoCodeNotFoundError:
        return await OwnerCodesService(session).usable(user_id, raw, for_update=for_update)
