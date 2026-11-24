"""The owner's promo codes: a promotion with a `code`, entered by the customer at checkout.

An owner's code is a `Promotion` row whose `code` is set. It is never applied by itself
(`orders.active_promotions` leaves it out): it joins an order only when the customer types
it, and then as an ordinary `order_promotions` participation carrying its order's cycle
(`code_cycle_id`) — which makes «не больше раза за сбор» the database's own guarantee
(`uq_order_promotions_live_code_cycle`). How many times in all is `uses_per_customer` (NULL:
no limit), counted under the customer's row lock. A general code is open to every customer;
a personal one only to the customers in `promotion_code_users`.

Like every service here it takes the session, mutates, and leaves the commit to the caller.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, exists, func, select
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
    PromoCodeUsedThisCycleError,
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
from app.promotions.models import OrderPromotion, PromoCode, Promotion, PromotionCodeUser
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
    # Empty: a general code. Otherwise the only customers who may use it, in the form's order.
    assigned_user_ids: Sequence[uuid.UUID]
    # How many times one customer may use it, at most once per cycle. None: no limit.
    uses_per_customer: int | None
    conditions: Sequence[AnyCondition]
    rewards: Sequence[AnyCodeReward]


def handed_to(
    promotion: Promotion,
    user_ids: Sequence[uuid.UUID],
    *,
    was_user_ids: Sequence[uuid.UUID] = (),
    was_enabled: bool = False,
) -> list[uuid.UUID]:
    """The customers a write just gave this personal code to: the ones to tell.

    `user_ids` are the code's customers after the write, `was_user_ids` before it. A code
    reaches a customer when it is switched on for them — created that way, given to them,
    or switched on while theirs. Edits that change neither (a new title, a new date) are
    not news. The defaults describe a code that did not exist before.
    """
    if not promotion.is_enabled or promotion.deleted_at is not None:
        return []
    if not was_enabled:
        return list(user_ids)
    before = set(was_user_ids)
    return [user_id for user_id in user_ids if user_id not in before]


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

    async def users_of(self, promotions: Sequence[Promotion]) -> dict[uuid.UUID, list[User]]:
        """The customers each personal code is given to, in the order they were added, in
        one query. A general code has no entry."""
        if not promotions:
            return {}
        rows = await self._session.execute(
            select(PromotionCodeUser.promotion_id, User)
            .join(User, User.id == PromotionCodeUser.user_id)
            .where(PromotionCodeUser.promotion_id.in_([p.id for p in promotions]))
            .order_by(PromotionCodeUser.created_at, User.name, User.id)
        )
        users: dict[uuid.UUID, list[User]] = {}
        for promotion_id, user in rows.tuples():
            users.setdefault(promotion_id, []).append(user)
        return users

    async def assignees(self, promotion_id: uuid.UUID) -> list[uuid.UUID]:
        """The ids of the customers a code is given to; empty for a general one."""
        rows = await self._session.scalars(
            select(PromotionCodeUser.user_id)
            .where(PromotionCodeUser.promotion_id == promotion_id)
            .order_by(PromotionCodeUser.created_at, PromotionCodeUser.user_id)
        )
        return list(rows.all())

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
        await self._assign(promotion.id, draft.assigned_user_ids, previous=[])
        return promotion

    async def update(self, promotion_id: uuid.UUID, draft: OwnerCodeDraft) -> Promotion:
        promotion = await self.get(promotion_id)
        previous = await self.assignees(promotion_id)
        await self._check(draft, unchanged_user_ids=previous)
        self._apply(promotion, draft)
        await self._flush_code(promotion, draft.code)
        await self._assign(promotion.id, draft.assigned_user_ids, previous=previous)
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
        cycle_id: uuid.UUID | None,
        for_update: bool = False,
        except_order_id: uuid.UUID | None = None,
    ) -> Promotion:
        """The owner's code, if this customer may put it on an order in `cycle_id` now.

        Refusals come in the order issued codes give them. A missing, archived, switched-off
        or somebody else's personal code all answer `PromoCodeNotFoundError`: the API must
        not confirm that a string is a real code to anybody it is not for. Then the uses:
        all of them spent (`PromoCodeAlreadyUsedError`), or one already in this cycle
        (`PromoCodeUsedThisCycleError`; skipped when `cycle_id` is None — no cycle is
        collecting, and the cart check then answers on the dates and the conditions alone).
        `for_update` takes the customer's row lock (the one `refresh` takes), so two
        checkouts of one customer meet here and the second sees the first one's
        participation. `except_order_id` is an order that is allowed to already hold it
        (taking it back).
        """
        promotion = await self._session.scalar(
            select(Promotion).where(Promotion.code == normalize_code(raw))
        )
        if (
            promotion is None
            or promotion.deleted_at is not None
            or not promotion.is_enabled
            or not await self._open_to(promotion.id, user_id)
        ):
            raise PromoCodeNotFoundError
        if for_update:
            await self._session.execute(select(User.id).where(User.id == user_id).with_for_update())
        query = select(OrderPromotion.code_cycle_id).where(
            OrderPromotion.promotion_id == promotion.id,
            OrderPromotion.user_id == user_id,
            OrderPromotion.released_at.is_(None),
        )
        if except_order_id is not None:
            query = query.where(OrderPromotion.order_id != except_order_id)
        used_in = list((await self._session.scalars(query)).all())
        if promotion.uses_per_customer is not None and len(used_in) >= promotion.uses_per_customer:
            raise PromoCodeAlreadyUsedError
        if cycle_id is not None and cycle_id in used_in:
            raise PromoCodeUsedThisCycleError
        now = datetime.now(UTC)
        if promotion.ends_at is not None and now >= promotion.ends_at:
            raise PromoCodeExpiredError
        if now < promotion.starts_at:
            raise PromoCodeNotYetValidError
        return promotion

    async def personal_for_user(
        self, user_id: uuid.UUID, cycle_id: uuid.UUID | None
    ) -> list[tuple[Promotion, uuid.UUID | None, bool]]:
        """The personal codes given to this customer that they could still see: not
        archived, and either switched on or already held by one of their orders (a code
        switched off after it was used stays in the list, as used).

        Each comes with the order that stands for it, if the customer cannot use it right
        now because of their orders, and whether that order was paid for: the order in
        `cycle_id` (the collecting cycle) holding it, or — once every use is spent, or the
        code is switched off — the latest order holding it. A code with uses left and none
        in this cycle comes with no order: it is theirs to use.
        """
        promotions = (
            await self._session.scalars(
                select(Promotion)
                .join(PromotionCodeUser, PromotionCodeUser.promotion_id == Promotion.id)
                .where(
                    PromotionCodeUser.user_id == user_id,
                    Promotion.code.is_not(None),
                    Promotion.deleted_at.is_(None),
                )
            )
        ).all()
        if not promotions:
            return []
        rows = await self._session.execute(
            select(OrderPromotion.promotion_id, Order.id, Order.status, Order.cycle_id)
            .join(Order, Order.id == OrderPromotion.order_id)
            .where(
                OrderPromotion.user_id == user_id,
                OrderPromotion.released_at.is_(None),
                OrderPromotion.promotion_id.in_([p.id for p in promotions]),
            )
            .order_by(OrderPromotion.created_at)
        )
        held: dict[uuid.UUID, list[tuple[uuid.UUID, bool, uuid.UUID]]] = {}
        for pid, oid, status, order_cycle_id in rows.tuples():
            if pid is not None:
                held.setdefault(pid, []).append((oid, status in PAID_STATUSES, order_cycle_id))
        result: list[tuple[Promotion, uuid.UUID | None, bool]] = []
        for p in promotions:
            orders = held.get(p.id, [])
            if not p.is_enabled and not orders:
                continue
            this_cycle = next((o for o in orders if o[2] == cycle_id), None)
            spent = p.uses_per_customer is not None and len(orders) >= p.uses_per_customer
            standing = this_cycle or (
                orders[-1] if orders and (spent or not p.is_enabled) else None
            )
            result.append((p, standing[0], standing[1]) if standing else (p, None, False))
        return result

    # --- internals ------------------------------------------------------------------------

    async def _open_to(self, promotion_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """Whether this customer may use the code at all: it is general, or theirs."""
        personal = await self._session.scalar(
            select(exists().where(PromotionCodeUser.promotion_id == promotion_id))
        )
        if not personal:
            return True
        return bool(
            await self._session.scalar(
                select(
                    exists().where(
                        PromotionCodeUser.promotion_id == promotion_id,
                        PromotionCodeUser.user_id == user_id,
                    )
                )
            )
        )

    async def _check(
        self, draft: OwnerCodeDraft, *, unchanged_user_ids: Sequence[uuid.UUID] = ()
    ) -> None:
        """Validates the draft. Only the customers newly given the code are looked up: a
        code kept on a customer who has since been deleted can still be edited."""
        if draft.ends_at is not None and draft.ends_at <= draft.starts_at:
            raise PromotionEndsBeforeStartError
        await self._promotions.check_references(draft.conditions, draft.rewards)
        new = set(draft.assigned_user_ids) - set(unchanged_user_ids)
        if new:
            found = await self._session.scalar(
                select(func.count()).where(User.id.in_(new), User.deleted_at.is_(None))
            )
            if found != len(new):
                raise PromoCodeUserNotFoundError

    async def _assign(
        self,
        promotion_id: uuid.UUID,
        user_ids: Sequence[uuid.UUID],
        *,
        previous: Sequence[uuid.UUID],
    ) -> None:
        """Brings `promotion_code_users` in line with the draft: who is no longer on the
        list goes, who is new comes. Taking a customer off does not touch an order that
        already holds the code."""
        wanted = set(user_ids)
        gone = set(previous) - wanted
        if gone:
            await self._session.execute(
                delete(PromotionCodeUser).where(
                    PromotionCodeUser.promotion_id == promotion_id,
                    PromotionCodeUser.user_id.in_(gone),
                )
            )
        kept = set(previous)
        self._session.add_all(
            PromotionCodeUser(promotion_id=promotion_id, user_id=user_id)
            for user_id in dict.fromkeys(user_ids)
            if user_id not in kept
        )
        await self._session.flush()

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
        # Legacy column, written for a rollback's sake only (see the model).
        promotion.assigned_user_id = draft.assigned_user_ids[0] if draft.assigned_user_ids else None
        promotion.uses_per_customer = draft.uses_per_customer
        promotion.conditions = dump_conditions(list(draft.conditions))
        promotion.rewards = dump_rewards(list(draft.rewards))


async def resolve_code(
    session: AsyncSession,
    user_id: uuid.UUID,
    raw: str,
    *,
    cycle_id: uuid.UUID | None,
    for_update: bool = False,
) -> PromoCode | Promotion:
    """The code the customer typed: one issued to them, or an owner's.

    A string that is not theirs issued code falls through to the owner codes; the refusal
    is the owner lookup's then. Any other refusal of an issued code (used, expired) is final:
    that string is theirs. `cycle_id` is the cycle the order goes into, for an owner's
    code's once-per-cycle rule.
    """
    try:
        return await PromoCodesService(session).usable(user_id, raw, for_update=for_update)
    except PromoCodeNotFoundError:
        return await OwnerCodesService(session).usable(
            user_id, raw, cycle_id=cycle_id, for_update=for_update
        )
