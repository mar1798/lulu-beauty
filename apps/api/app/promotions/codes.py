"""Promo codes: issued when an order is paid for, entered at checkout, used when that order is.

A code is the reward of a promotion's `PROMO_CODE` row. The promotion's template (its
conditions, rewards and validity) is copied onto the code when it is issued, so editing
the promotion afterwards leaves codes already handed out meaning what they meant.

The life of a code (`PromoCodeStatus`, see `docs/domain.md`):

- **Issued** when an order that holds the promotion becomes CONFIRMED — by the owner's
  verdict on a receipt (`PaymentsService.review`) or by hand (`OrdersService.update_status`),
  both through `PromoCodesService.on_paid`. A sweep (`issue_missing_promo_codes`) catches
  an order whose event was lost; both are idempotent, which `uq_promo_codes_live_owner`
  guarantees in the database and not just here.
- **Reserved** at checkout (`OrderPromotionsService.attach_code`): the code sits on one
  PENDING order, and the order's participation points at it.
- **Used** when that order is paid for (`on_paid`).
- **Revoked** when the order that earned it is cancelled before anybody used it.
- **Expired** is not a status: it is `expires_at` against the clock (`code_status`).

Mutates and flushes; never commits. Notifying the customer is the caller's business, after
the commit — `on_paid` and the sweep return the codes they issued so it can.
"""

import enum
import logging
import secrets
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.orders.models import Order, OrderStatus
from app.promotions.code_errors import (
    PromoCodeAlreadyUsedError,
    PromoCodeExpiredError,
    PromoCodeNotFoundError,
    PromoCodeNotYetValidError,
)
from app.promotions.models import OrderPromotion, PromoCode, PromoCodeStatus, Promotion
from app.promotions.rules import (
    PromoCodeReward,
    dump_conditions,
    dump_rewards,
    load_rewards,
    promo_code_expiry,
)

logger = logging.getLogger(__name__)

# Eight characters from this alphabet: upper-case letters and digits without the
# look-alikes 0/O and 1/I — a code is read off a screen and typed into another.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8

# Orders that were paid for: nothing reaches READY unpaid (`ALLOWED_TRANSITIONS`).
PAID_STATUSES = frozenset({OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.COMPLETED})

# How many orders one sweep tick looks at; a backlog drains over a few ticks.
SWEEP_BATCH = 200

# Tries to find a code string nobody has — a collision in 32^8 is a freak, not a loop.
_ISSUE_ATTEMPTS = 5


class PromoCodeView(enum.StrEnum):
    """What the customer sees: the stored status, with EXPIRED derived from the clock."""

    ACTIVE = "ACTIVE"
    RESERVED = "RESERVED"
    USED = "USED"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"


def generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(raw: str) -> str:
    """What the customer typed, as it is stored: no spaces or dashes, upper case."""
    return "".join(ch for ch in raw.upper() if not ch.isspace() and ch != "-")


def code_status(code: PromoCode, now: datetime) -> PromoCodeView:
    """The status as shown. Only an unused code expires: a reserved or used one already
    has an order that took it, and the date no longer concerns it."""
    if code.status is PromoCodeStatus.ACTIVE and now >= code.expires_at:
        return PromoCodeView.EXPIRED
    return PromoCodeView(code.status.value)


@dataclass(frozen=True)
class OrderCodes:
    """The codes one order is about: the one it holds, and the ones it earned."""

    used: PromoCode | None = None
    issued: list[PromoCode] = field(default_factory=list)


class PromoCodesService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # --- Issuing --------------------------------------------------------------------------

    async def on_paid(self, order: Order) -> list[PromoCode]:
        """The order was just paid for (now CONFIRMED): its code is used, and it earns new ones.

        Returns the codes issued, for the notification the caller sends after the commit.
        A repeat call issues nothing. Needs `order.promotions` (always loaded).
        """
        for participation in order.promotions:
            if participation.released_at is None and participation.promo_code_id is not None:
                code = await self._session.get(PromoCode, participation.promo_code_id)
                if code is not None and code.status is PromoCodeStatus.RESERVED:
                    code.status = PromoCodeStatus.USED
                    code.used_order_id = order.id
        return await self.issue_for_order(order)

    async def issue_for_order(self, order: Order) -> list[PromoCode]:
        """A code for every promotion the order holds that rewards one, unless it has one."""
        issued: list[PromoCode] = []
        for participation in order.promotions:
            if participation.released_at is not None or participation.promotion_id is None:
                continue
            template = _code_template(participation)
            if template is None:
                continue
            code = await self._issue(order, participation.promotion_id, template)
            if code is not None:
                issued.append(code)
        return issued

    async def _issue(
        self, order: Order, promotion_id: uuid.UUID, template: PromoCodeReward
    ) -> PromoCode | None:
        """One code, or None when the customer already holds one for this promotion.

        The partial unique index is the real guard: two events racing (a verdict and the
        sweep) both pass the check below, and the second one's insert fails — which is read
        as "already issued". Inside a savepoint, so the failure leaves the transaction usable.
        """
        now = datetime.now(UTC)
        valid_from, expires_at = promo_code_expiry(template, now)
        for _ in range(_ISSUE_ATTEMPTS):
            if await self._has_standing_code(order.user_id, promotion_id):
                return None
            code = PromoCode(
                id=uuid.uuid4(),
                code=generate_code(),
                user_id=order.user_id,
                promotion_id=promotion_id,
                source_order_id=order.id,
                conditions=dump_conditions(list(template.conditions)),
                rewards=dump_rewards(list(template.rewards)),
                valid_from=valid_from,
                expires_at=expires_at,
                status=PromoCodeStatus.ACTIVE,
            )
            try:
                async with self._session.begin_nested():
                    self._session.add(code)
                    await self._session.flush()
            except IntegrityError:
                # Either the code string was taken, or somebody issued this one first; the
                # check at the top of the next round tells which.
                continue
            return code
        logger.error("no free promo code string after %d tries", _ISSUE_ATTEMPTS)
        return None

    async def _has_standing_code(self, user_id: uuid.UUID, promotion_id: uuid.UUID) -> bool:
        return bool(
            await self._session.scalar(
                select(
                    exists().where(
                        PromoCode.user_id == user_id,
                        PromoCode.promotion_id == promotion_id,
                        PromoCode.status != PromoCodeStatus.REVOKED,
                    )
                )
            )
        )

    async def issue_missing(self, limit: int = SWEEP_BATCH) -> list[PromoCode]:
        """Codes for paid orders that never got theirs — the event may have failed.

        A paid order qualifies while one of its live participations rewards a code the
        customer holds no standing one for. Returns what it issued, for the notifications.
        """
        has_code = exists().where(
            PromoCode.promotion_id == OrderPromotion.promotion_id,
            PromoCode.user_id == OrderPromotion.user_id,
            PromoCode.status != PromoCodeStatus.REVOKED,
        )
        missing = select(OrderPromotion.order_id).where(
            OrderPromotion.released_at.is_(None),
            OrderPromotion.promotion_id.is_not(None),
            OrderPromotion.rewards.contains([{"type": "PROMO_CODE"}]),
            ~has_code,
        )
        order_ids = (
            await self._session.scalars(
                select(Order.id)
                .where(Order.status.in_(PAID_STATUSES), Order.id.in_(missing))
                .order_by(Order.created_at)
                .limit(limit)
            )
        ).all()
        issued: list[PromoCode] = []
        for order_id in order_ids:
            order = await self._session.get(Order, order_id)
            if order is not None:
                issued.extend(await self.issue_for_order(order))
        return issued

    # --- Using ----------------------------------------------------------------------------

    async def usable(self, user_id: uuid.UUID, raw: str, *, for_update: bool = False) -> PromoCode:
        """The customer's code, if it may be put on an order now.

        Somebody else's code, a revoked one and one that does not exist all answer the same
        `PromoCodeNotFoundError`. `for_update` locks the row: two checkouts of one code meet
        here, and the second reads the first one's reservation once it has committed.
        """
        query = select(PromoCode).where(
            PromoCode.code == normalize_code(raw), PromoCode.user_id == user_id
        )
        if for_update:
            query = query.with_for_update().execution_options(populate_existing=True)
        code = await self._session.scalar(query)
        if code is None or code.status is PromoCodeStatus.REVOKED:
            raise PromoCodeNotFoundError
        if code.status in (PromoCodeStatus.USED, PromoCodeStatus.RESERVED):
            raise PromoCodeAlreadyUsedError
        now = datetime.now(UTC)
        if now >= code.expires_at:
            raise PromoCodeExpiredError
        if now < code.valid_from:
            raise PromoCodeNotYetValidError
        return code

    # --- Reading --------------------------------------------------------------------------

    async def list_for_user(self, user_id: uuid.UUID) -> list[tuple[PromoCode, str | None]]:
        """All the customer's codes, newest first, each with the title of its promotion."""
        rows = await self._session.execute(
            select(PromoCode, Promotion.title)
            .join(Promotion, Promotion.id == PromoCode.promotion_id)
            .where(PromoCode.user_id == user_id)
            .order_by(PromoCode.created_at.desc(), PromoCode.id)
        )
        return [(code, title) for code, title in rows.tuples()]

    async def for_orders(self, orders: Sequence[Order]) -> dict[uuid.UUID, OrderCodes]:
        """The code each order holds and the codes it earned — two directions, one query.

        Read fresh from the database (`populate_existing`): a status changed a moment ago in
        this same transaction must show in the response built right after.
        """
        ids = {order.id for order in orders}
        if not ids:
            return {}
        found = (
            await self._session.scalars(
                select(PromoCode)
                .where(or_(PromoCode.source_order_id.in_(ids), PromoCode.used_order_id.in_(ids)))
                .order_by(PromoCode.created_at, PromoCode.id)
                .execution_options(populate_existing=True)
            )
        ).all()
        used: dict[uuid.UUID, PromoCode] = {}
        issued: dict[uuid.UUID, list[PromoCode]] = {}
        for code in found:
            if code.source_order_id in ids and code.source_order_id is not None:
                issued.setdefault(code.source_order_id, []).append(code)
            if (
                code.used_order_id in ids
                and code.used_order_id is not None
                and code.status in (PromoCodeStatus.RESERVED, PromoCodeStatus.USED)
            ):
                used[code.used_order_id] = code
        return {
            order_id: OrderCodes(used=used.get(order_id), issued=issued.get(order_id, []))
            for order_id in ids
        }


def _code_template(participation: OrderPromotion) -> PromoCodeReward | None:
    """The `PROMO_CODE` reward a participation took, from its snapshot; None without one."""
    try:
        rewards = load_rewards(participation.rewards)
    except ValidationError:
        logger.exception("order promotion %s has rewards that do not parse", participation.id)
        return None
    return next((r for r in rewards if isinstance(r, PromoCodeReward)), None)


async def issue_missing_promo_codes(session: AsyncSession) -> list[PromoCode]:
    """Sweep entry point (the scheduler's promotion sweep): issue the codes paid orders
    missed. The returned codes are the ones to tell their owners about, after the commit."""
    return await PromoCodesService(session).issue_missing()
