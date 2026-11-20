"""Promotions on orders and carts: which an order holds, what it gets, what a cart would get.

`engine.py` answers "does this list of lines qualify for these offers"; this module is the
part that has a session. It chooses the offers to try, keeps the order's own rows in step
with the answer (`order_promotions`, `order_gifts`) and previews the same answer for a cart.
The money is never counted here — that is `app/orders/discounts.py`, which reads the rows
written here.

The rules of the lifecycle (see `docs/domain.md`):

- While an order is PENDING every change to it asks again (`OrderPromotionsService.refresh`).
  A promotion the order already holds stays while its conditions hold, even once the
  promotion has ended or been switched off — the customer was promised it. A promotion
  that is live now and not held yet joins, if the customer has not taken part through
  another order. One whose conditions no longer hold is released (`released_at`), and the
  customer may take part again.
- From the bill on (AWAITING_PAYMENT and later) nothing here runs: a bill is a sum, and
  the set of promotions behind it is frozen. Restoring a cancelled order asks again.
- «Один раз на покупателя» is the partial unique index on `order_promotions`, and under a
  race it is the customer's row, locked (`SELECT … FOR UPDATE`), that makes the second of
  two checkouts wait and then see the first one's participation.
"""

import logging
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import User
from app.catalog.images import variant_image_url
from app.catalog.labels import product_label
from app.catalog.models import Category, Product, ProductVariant
from app.orders.discounts import (
    PromoDiscount,
    PromoLayer,
    order_totals,
    promo_item_discounts,
    promo_order_discounts,
)
from app.orders.models import Order, OrderStatus
from app.promotions.code_errors import PromoCodeConditionsNotMetError
from app.promotions.engine import (
    Evaluation,
    Line,
    Offer,
    Shortfall,
    evaluate,
    matching_lines,
    qualifies,
)
from app.promotions.models import OrderGift, OrderPromotion, PromoCode, PromoCodeStatus, Promotion
from app.promotions.rules import (
    AnyCodeReward,
    AnyReward,
    DiscountReward,
    GiftKind,
    GiftReward,
    dump_rewards,
    load_code_rewards,
    load_conditions,
    load_rewards,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LineTags:
    """What a promotion's target can ask about a product beyond the line itself."""

    # The product's category and the section above it, as `Line.category_ids` wants.
    category_ids: frozenset[uuid.UUID]
    brand: str | None


_NO_TAGS = LineTags(category_ids=frozenset(), brand=None)


async def load_line_tags(
    session: AsyncSession, product_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, LineTags]:
    """Brand and category (with its section) of these products — one query.

    Soft-deleted products are included, like every label read for an order: the row
    survives so the order stays renderable, and it still has its brand.
    """
    ids = set(product_ids)
    if not ids:
        return {}
    rows = await session.execute(
        select(Product.id, Product.brand, Product.category_id, Category.parent_id)
        .outerjoin(Category, Category.id == Product.category_id)
        .where(Product.id.in_(ids))
    )
    return {
        product_id: LineTags(
            category_ids=frozenset(c for c in (category_id, parent_id) if c is not None),
            brand=brand,
        )
        for product_id, brand, category_id, parent_id in rows.tuples()
    }


def lines_of_order(order: Order, tags: dict[uuid.UUID, LineTags]) -> list[Line]:
    lines: list[Line] = []
    for item in order.items:
        tag = tags.get(item.product_id, _NO_TAGS) if item.product_id is not None else _NO_TAGS
        lines.append(
            Line(
                product_id=item.product_id,
                variant_id=item.variant_id,
                category_ids=tag.category_ids,
                brand=tag.brand,
                price_cents=item.product_price_cents,
                quantity=item.quantity,
                key=item.id,
            )
        )
    return lines


def _offer(promotion: Promotion, rewards: Sequence[AnyReward] | None = None) -> Offer | None:
    """The promotion as the engine tries it; None for a row whose rules no longer parse.

    A bad row must not take every checkout down with it: it is left out and logged, and
    the admin sees it when they open the promotion.
    """
    try:
        return Offer(
            id=promotion.id,
            title=promotion.title,
            conditions=load_conditions(promotion.conditions),
            rewards=load_rewards(promotion.rewards) if rewards is None else rewards,
            sort_order=promotion.sort_order,
        )
    except ValidationError:
        logger.exception("promotion %s has rules that do not parse", promotion.id)
        return None


# A code's cart-wide discount is taken after every promotion's: it is the customer's own
# addition to the order, and the promotions' `sort_order` is small and the admin's.
CODE_SORT_ORDER = 1_000_000


def code_title(code: PromoCode) -> str:
    """What a participation through this code is called — a snapshot, like a promotion's title."""
    return f"Промокод {code.code}"


def code_offer(code: PromoCode, rewards: Sequence[AnyCodeReward] | None = None) -> Offer | None:
    """The code as the engine tries it; None for a row whose rules no longer parse.

    The conditions and rewards are the ones snapshotted on the code when it was issued.
    """
    try:
        return Offer(
            id=code.id,
            title=code_title(code),
            conditions=load_conditions(code.conditions),
            rewards=load_code_rewards(code.rewards) if rewards is None else rewards,
            sort_order=CODE_SORT_ORDER,
        )
    except ValidationError:
        logger.exception("promo code %s has rules that do not parse", code.id)
        return None


def item_scopes(
    rewards: Sequence[AnyReward] | Sequence[AnyCodeReward], lines: Sequence[Line]
) -> dict[str, list[str]]:
    """For each line-targeted discount, the lines it landed on: reward index -> line keys."""
    scopes: dict[str, list[str]] = {}
    for index, reward in enumerate(rewards):
        if isinstance(reward, DiscountReward) and reward.is_on_items:
            scopes[str(index)] = [
                str(line.key)
                for line in matching_lines(lines, reward.target)
                if line.key is not None
            ]
    return scopes


def layer_of(
    key: uuid.UUID,
    sort_order: int,
    rewards: Sequence[AnyReward] | Sequence[AnyCodeReward],
    lines: Sequence[Line],
) -> PromoLayer | None:
    """The offer's money rewards as a layer for `app/orders/discounts.py`; None without any."""
    scopes = item_scopes(rewards, lines)
    discounts = tuple(
        PromoDiscount(
            kind=reward.kind,
            value=reward.value,
            line_keys=(
                frozenset(uuid.UUID(k) for k in scopes[str(index)]) if reward.is_on_items else None
            ),
        )
        for index, reward in enumerate(rewards)
        if isinstance(reward, DiscountReward)
    )
    return PromoLayer(key=key, sort_order=sort_order, discounts=discounts) if discounts else None


@dataclass(frozen=True)
class GiftSpec:
    """A gift as it is going to be given — what `order_gifts` and the cart preview carry."""

    kind: GiftKind
    title: str
    image_url: str | None
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    quantity: int


async def resolve_gifts(
    session: AsyncSession, rewards: Sequence[AnyReward] | Sequence[AnyCodeReward]
) -> list[GiftSpec]:
    """The gifts these rewards give, read against the catalogue as it is now.

    A catalogue gift whose volume has left the shelf (gone, or out of stock) is left out:
    nobody can be promised what the shop cannot hand over, and the rest of the promotion
    still applies.
    """
    gifts = [reward for reward in rewards if isinstance(reward, GiftReward)]
    variant_ids = {gift.variant_id for gift in gifts if gift.variant_id is not None}
    found: dict[uuid.UUID, tuple[ProductVariant, Product]] = {}
    if variant_ids:
        rows = await session.execute(
            select(ProductVariant, Product)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.deleted_at.is_(None),
                ProductVariant.in_stock.is_(True),
                Product.deleted_at.is_(None),
            )
            .options(selectinload(Product.images))
        )
        found = {variant.id: (variant, product) for variant, product in rows.tuples()}

    specs: list[GiftSpec] = []
    for gift in gifts:
        if gift.gift is GiftKind.CUSTOM or gift.variant_id is None:
            specs.append(
                GiftSpec(
                    kind=GiftKind.CUSTOM,
                    title=gift.title,
                    image_url=gift.image_url,
                    product_id=None,
                    variant_id=None,
                    quantity=gift.quantity,
                )
            )
            continue
        match = found.get(gift.variant_id)
        if match is None:
            continue
        variant, product = match
        specs.append(
            GiftSpec(
                kind=GiftKind.PRODUCT,
                title=product_label(product.name, variant.volume_ml, variant.shade),
                image_url=variant_image_url(product.images, variant.volume_ml, variant.shade),
                product_id=product.id,
                variant_id=variant.id,
                quantity=gift.quantity,
            )
        )
    return specs


async def active_promotions(session: AsyncSession, now: datetime) -> list[Promotion]:
    """Enabled, not archived, inside `[starts_at, ends_at)` — in carousel order."""
    result = await session.execute(
        select(Promotion)
        .where(
            Promotion.deleted_at.is_(None),
            Promotion.is_enabled.is_(True),
            Promotion.starts_at <= now,
            Promotion.ends_at > now,
        )
        .order_by(Promotion.sort_order, Promotion.title, Promotion.id)
    )
    return list(result.scalars().all())


async def joined_promotion_ids(
    session: AsyncSession, user_id: uuid.UUID, *, except_order_id: uuid.UUID | None = None
) -> frozenset[uuid.UUID]:
    """Promotions this customer holds through a live participation — «один раз»."""
    query = select(OrderPromotion.promotion_id).where(
        OrderPromotion.user_id == user_id,
        OrderPromotion.released_at.is_(None),
        OrderPromotion.promotion_id.is_not(None),
    )
    if except_order_id is not None:
        query = query.where(OrderPromotion.order_id != except_order_id)
    return frozenset(
        promotion_id for promotion_id in (await session.scalars(query)).all() if promotion_id
    )


@dataclass(frozen=True)
class PromotionDelta:
    """What a recount did to an order's promotions, for the customer's warning and tests."""

    attached: list[OrderPromotion] = field(default_factory=list)
    released: list[OrderPromotion] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.attached or self.released)


class OrderPromotionsService:
    """Keeps an order's `order_promotions` and `order_gifts` true to its lines.

    Mutates and flushes; the caller owns the transaction. The order's `total_cents` is not
    touched here — the caller recounts after (`OrdersService._recalculate_total`).
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        # Read once per service, i.e. once per request: a price list repricing thousands
        # of orders must not ask for the live promotions thousands of times.
        self._active: list[Promotion] | None = None

    async def _live_promotions(self, now: datetime) -> list[Promotion]:
        if self._active is None:
            self._active = await active_promotions(self._session, now)
        return self._active

    async def refresh(self, order: Order) -> PromotionDelta:
        """Ask again which promotions a PENDING order holds, and bring its rows in line.

        A no-op for any other status: from the bill on the set is frozen.
        """
        if order.status is not OrderStatus.PENDING:
            return PromotionDelta()
        # Lines saved first — the scopes name them by id — and the order itself, which a
        # new participation points at.
        await self._session.flush()

        now = datetime.now(UTC)
        live = [p for p in order.promotions if p.released_at is None]
        held = {p.promotion_id: p for p in live if p.promotion_id is not None}
        held_codes = {p.promo_code_id: p for p in live if p.promo_code_id is not None}
        candidates = [p for p in await self._live_promotions(now) if p.id not in held]
        if not held and not held_codes and not candidates:
            return PromotionDelta()

        promotions = {
            promotion.id: promotion
            for promotion in (
                await self._session.scalars(select(Promotion).where(Promotion.id.in_(held)))
            ).all()
        }
        offers: list[Offer] = []
        for promotion_id, participation in held.items():
            promotion = promotions.get(promotion_id)
            if promotion is None:
                continue
            # The conditions are the promotion's own; what the order is promised is the
            # snapshot it took.
            offer = _offer(promotion, load_rewards(participation.rewards))
            if offer is not None:
                offers.append(offer)

        if held_codes:
            # A code the order holds stays while its conditions hold, whether or not it has
            # expired since — the same promise a promotion keeps. It never *joins* here: a
            # code is entered at checkout and nowhere else.
            codes = (
                await self._session.scalars(select(PromoCode).where(PromoCode.id.in_(held_codes)))
            ).all()
            for code in codes:
                code_rewards = load_code_rewards(held_codes[code.id].rewards)
                if (offer := code_offer(code, code_rewards)) is not None:
                    offers.append(offer)

        joined: frozenset[uuid.UUID] = frozenset()
        if candidates:
            # The customer's row, locked: two checkouts of one customer meet here, and the
            # second reads the first one's participation once it has committed.
            await self._session.execute(
                select(User.id).where(User.id == order.user_id).with_for_update()
            )
            joined = await joined_promotion_ids(
                self._session, order.user_id, except_order_id=order.id
            )
            for promotion in candidates:
                offer = _offer(promotion)
                if offer is not None:
                    offers.append(offer)

        tags = await load_line_tags(
            self._session, {i.product_id for i in order.items if i.product_id is not None}
        )
        lines = lines_of_order(order, tags)
        evaluation = evaluate(lines, offers, already_joined=joined)
        return await self._apply(order, live, evaluation, lines, now)

    async def _apply(
        self,
        order: Order,
        live: list[OrderPromotion],
        evaluation: Evaluation,
        lines: Sequence[Line],
        now: datetime,
    ) -> PromotionDelta:
        applied = {offer.id: offer for offer in evaluation.applied}
        delta = PromotionDelta()

        for participation in live:
            # A promotion's id and a code's id never meet: they are different tables' uuids.
            key = participation.promotion_id or participation.promo_code_id
            offer = applied.get(key) if key is not None else None
            if offer is None:
                self._release(order, participation, now)
                await self._free_code(participation)
                delta.released.append(participation)
            else:
                participation.item_scopes = (
                    item_scopes(load_rewards(participation.rewards), lines) or None
                )

        # Codes are never attached by a recount, so only what the order already holds is
        # skipped here — a code's offer is in `applied` solely because it is held.
        held = {p.promotion_id or p.promo_code_id for p in live}
        for offer in evaluation.applied:
            if offer.id in held:
                continue
            delta.attached.append(await self._attach(order, offer, lines))

        await self._session.flush()
        return delta

    async def _attach(
        self,
        order: Order,
        offer: Offer,
        lines: Sequence[Line],
        code: PromoCode | None = None,
    ) -> OrderPromotion:
        rewards = list(offer.rewards)
        participation = OrderPromotion(
            id=uuid.uuid4(),
            order_id=order.id,
            user_id=order.user_id,
            promotion_id=None if code is not None else offer.id,
            promo_code_id=code.id if code is not None else None,
            title=offer.title,
            rewards=dump_rewards(rewards),
            sort_order=offer.sort_order,
            item_scopes=item_scopes(rewards, lines) or None,
        )
        order.promotions.append(participation)
        # Saved before its gifts: nothing in the mappers tells the unit of work that
        # `order_gifts` points at it, so the insert order is ours to keep.
        await self._session.flush()
        for gift in await resolve_gifts(self._session, rewards):
            order.gifts.append(
                OrderGift(
                    order_promotion_id=participation.id,
                    kind=gift.kind,
                    title=gift.title,
                    image_url=gift.image_url,
                    product_id=gift.product_id,
                    variant_id=gift.variant_id,
                    quantity=gift.quantity,
                )
            )
        return participation

    @staticmethod
    def _release(order: Order, participation: OrderPromotion, now: datetime) -> None:
        """End a participation without the order: the row stays as history, its gifts go."""
        participation.released_at = now
        for gift in [g for g in order.gifts if g.order_promotion_id == participation.id]:
            order.gifts.remove(gift)

    async def _free_code(self, participation: OrderPromotion) -> None:
        """A participation through a code ended: the code goes back to the customer."""
        if participation.promo_code_id is None:
            return
        code = await self._session.get(PromoCode, participation.promo_code_id)
        if code is not None and code.status is PromoCodeStatus.RESERVED:
            code.status = PromoCodeStatus.ACTIVE
            code.used_order_id = None

    async def release_codes_of(self, order: Order) -> None:
        """Give back the codes this order holds, without ending its participations — for an
        order that is about to be deleted outright."""
        for participation in order.promotions:
            if participation.released_at is None:
                await self._free_code(participation)

    async def _code_offer_for(self, order: Order, code: PromoCode) -> tuple[Offer, list[Line]]:
        """The code as an offer, and the order's lines — or `PromoCodeConditionsNotMetError`."""
        offer = code_offer(code)
        if offer is None:
            raise PromoCodeConditionsNotMetError
        tags = await load_line_tags(
            self._session, {i.product_id for i in order.items if i.product_id is not None}
        )
        lines = lines_of_order(order, tags)
        if not qualifies(lines, offer):
            raise PromoCodeConditionsNotMetError
        return offer, lines

    async def check_code(self, order: Order, code: PromoCode) -> None:
        """Whether the order's lines meet the code's conditions, before anything is written.

        Works on an order that has not been added to the session yet, which is how checkout
        refuses a code without having touched the cart.
        """
        await self._code_offer_for(order, code)

    async def attach_code(self, order: Order, code: PromoCode) -> OrderPromotion:
        """Put a promo code on an order and reserve it — at checkout, the only place a code
        is entered.

        The code must already be the customer's, unused and inside its dates
        (`PromoCodesService.usable`); what is checked here is the one thing that depends on
        the order, its lines against the code's conditions. The order is then counted like
        one holding a promotion: the engine, `item_scopes`, the gifts. The caller recounts
        the total. Needs `order.items`, and the code's row locked.
        """
        await self._session.flush()
        offer, lines = await self._code_offer_for(order, code)
        participation = await self._attach(order, offer, lines, code)
        code.status = PromoCodeStatus.RESERVED
        code.used_order_id = order.id
        await self._session.flush()
        return participation

    async def release_all(self, order: Order, *, was_status: OrderStatus) -> list[OrderPromotion]:
        """The order is off (cancelled): every live participation ends, the customer is free
        to take part again with another order.

        `was_status` is the status the order had before it was cancelled. A PENDING order's
        total is counted again without the promotions, so it reads as what it would have
        cost, nothing promised. From the bill on the total is the bill — or the sum that was
        paid — and it stays as it is: the promotions are let go, the money is not rewritten.

        The codes follow: one the order held goes back to ACTIVE, and the ones it earned
        that nobody has used are revoked. Needs `order.items`.
        """
        now = datetime.now(UTC)
        released = [p for p in order.promotions if p.released_at is None]
        for participation in released:
            self._release(order, participation, now)
            await self._free_code(participation)
        revoked = await self._revoke_issued(order)
        if released and was_status is OrderStatus.PENDING:
            order.total_cents = order_totals(order).total_cents
        if released or revoked:
            await self._session.flush()
        return released

    async def _revoke_issued(self, order: Order) -> list[PromoCode]:
        """Codes this order earned and nobody has used are taken back; a used one stays.

        A code still RESERVED by another order that has not been billed is let go from it
        too, since the customer is about to pay for it. One reserved in a billed order is
        left alone — the bill promised it, and it is as good as used.
        """
        found = (
            await self._session.scalars(
                select(PromoCode)
                .where(
                    PromoCode.source_order_id == order.id,
                    PromoCode.status.in_([PromoCodeStatus.ACTIVE, PromoCodeStatus.RESERVED]),
                )
                .with_for_update()
            )
        ).all()
        revoked: list[PromoCode] = []
        for code in found:
            if code.status is PromoCodeStatus.RESERVED and not await self._take_from_holder(code):
                continue
            code.status = PromoCodeStatus.REVOKED
            code.used_order_id = None
            revoked.append(code)
        return revoked

    async def _take_from_holder(self, code: PromoCode) -> bool:
        """Release a RESERVED code from the PENDING order holding it; False if it is billed."""
        if code.used_order_id is None:
            return True
        holder = await self._session.scalar(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == code.used_order_id)
            .with_for_update(of=Order)
            .execution_options(populate_existing=True)
        )
        if holder is None:
            return True
        if holder.status is not OrderStatus.PENDING:
            return False
        now = datetime.now(UTC)
        for participation in holder.promotions:
            if participation.released_at is None and participation.promo_code_id == code.id:
                self._release(holder, participation, now)
        holder.total_cents = order_totals(holder).total_cents
        # The sum changed under the customer's eyes: the page they have open is stale.
        holder.revision = (holder.revision or 0) + 1
        return True


# --- Cart preview -------------------------------------------------------------------------


@dataclass(frozen=True)
class CartLine:
    product_id: uuid.UUID
    variant_id: uuid.UUID
    price_cents: int
    quantity: int


@dataclass(frozen=True)
class AppliedPreview:
    promotion: Promotion
    discount_cents: int
    gifts: list[GiftSpec]


@dataclass(frozen=True)
class HintPreview:
    promotion: Promotion
    missing_cents: int


@dataclass(frozen=True)
class AppliedCodePreview:
    code: PromoCode
    discount_cents: int
    gifts: list[GiftSpec]


@dataclass(frozen=True)
class CartPromotionsPreview:
    applied: list[AppliedPreview] = field(default_factory=list)
    hints: list[HintPreview] = field(default_factory=list)
    # The promo code the preview was asked about, when the cart qualifies for it; None when
    # no code was asked about, or when the cart does not meet its conditions. Its discount
    # is already inside the totals below.
    code: AppliedCodePreview | None = None
    items_discount_cents: int = 0
    order_discount_cents: int = 0
    # Price × quantity after the promotions' discounts — what the cart would come to.
    payable_cents: int = 0

    @property
    def discount_cents(self) -> int:
        return self.items_discount_cents + self.order_discount_cents

    @property
    def gifts(self) -> list[GiftSpec]:
        return [gift for entry in self.applied for gift in entry.gifts]


async def preview_cart(
    session: AsyncSession,
    user_id: uuid.UUID | None,
    cart: Sequence[CartLine],
    promo_code: PromoCode | None = None,
) -> CartPromotionsPreview:
    """What checkout would give this cart right now, without writing anything.

    The same engine and the same arithmetic as checkout, so the preview and the order made
    of it agree. A guest has taken part in nothing, so no promotion is hidden from them by
    «один раз» until they sign in.

    `promo_code` is a code the customer is checking: it is tried like one more offer, after
    the promotions, and counted into the totals when the cart qualifies for it. Whether it
    may be used at all (the owner, the dates, its status) is `PromoCodesService.usable`'s.
    """
    subtotal = sum(line.price_cents * line.quantity for line in cart)
    live = [line for line in cart if line.quantity > 0]
    if not live:
        return CartPromotionsPreview(payable_cents=subtotal)

    promotions = {p.id: p for p in await active_promotions(session, datetime.now(UTC))}
    if not promotions and promo_code is None:
        return CartPromotionsPreview(payable_cents=subtotal)

    tags = await load_line_tags(session, {line.product_id for line in live})
    lines = [
        Line(
            product_id=line.product_id,
            variant_id=line.variant_id,
            category_ids=tags.get(line.product_id, _NO_TAGS).category_ids,
            brand=tags.get(line.product_id, _NO_TAGS).brand,
            price_cents=line.price_cents,
            quantity=line.quantity,
            key=line.variant_id,
        )
        for line in live
    ]
    offers = [offer for p in promotions.values() if (offer := _offer(p)) is not None]
    joined = await joined_promotion_ids(session, user_id) if user_id is not None else frozenset()
    code_offer_ = code_offer(promo_code) if promo_code is not None else None
    if code_offer_ is not None:
        offers.append(code_offer_)
    evaluation = evaluate(lines, offers, already_joined=joined)

    layers = [
        layer
        for offer in evaluation.applied
        if (layer := layer_of(offer.id, offer.sort_order, list(offer.rewards), lines)) is not None
    ]
    by_layer, after_items = promo_item_discounts(
        [line.key for line in lines], [line.subtotal_cents for line in lines], layers
    )
    order_by_layer, payable = promo_order_discounts(sum(after_items), layers)
    for key, cents in order_by_layer.items():
        by_layer[key] = by_layer.get(key, 0) + cents

    applied = [
        AppliedPreview(
            promotion=promotions[offer.id],
            discount_cents=by_layer.get(offer.id, 0),
            gifts=await resolve_gifts(session, list(offer.rewards)),
        )
        for offer in evaluation.applied
        if offer.id in promotions
    ]
    code_preview: AppliedCodePreview | None = None
    if promo_code is not None and code_offer_ is not None:
        code_applied = next((o for o in evaluation.applied if o.id == promo_code.id), None)
        if code_applied is not None:
            code_preview = AppliedCodePreview(
                code=promo_code,
                discount_cents=by_layer.get(promo_code.id, 0),
                gifts=await resolve_gifts(session, list(code_applied.rewards)),
            )
    return CartPromotionsPreview(
        applied=applied,
        code=code_preview,
        hints=[
            _hint(promotions, shortfall)
            for shortfall in evaluation.shortfalls
            if shortfall.offer.id in promotions
        ],
        items_discount_cents=sum(by_layer.values()) - sum(order_by_layer.values()),
        order_discount_cents=sum(order_by_layer.values()),
        payable_cents=payable,
    )


def _hint(promotions: dict[uuid.UUID, Promotion], shortfall: Shortfall) -> HintPreview:
    return HintPreview(
        promotion=promotions[shortfall.offer.id], missing_cents=shortfall.missing_cents
    )
