"""What orders and carts say about promotions — the response shapes, and how they are built."""

import uuid

from app.common.schemas import CamelModel
from app.orders.discounts import OrderTotals
from app.orders.models import Order
from app.promotions.orders import CartPromotionsPreview, GiftSpec
from app.promotions.rules import GiftKind


class GiftResponse(CamelModel):
    """A gift — in the cart (a virtual line, never in `cart_items`) or on an order."""

    kind: GiftKind
    # The product's label for a catalogue gift ("Тушь, 10 мл"), the admin's words for a
    # free one ("Mystery box"); a free gift with no picture is drawn with a placeholder.
    title: str
    image_url: str | None
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    quantity: int


class OrderGiftResponse(GiftResponse):
    id: uuid.UUID
    order_promotion_id: uuid.UUID


class OrderPromotionResponse(CamelModel):
    """A promotion an order holds — a live participation, released ones are not shown."""

    id: uuid.UUID
    # Exactly one of the two is set; the promo code arrives with stage 3.
    promotion_id: uuid.UUID | None
    promo_code_id: uuid.UUID | None
    # A snapshot, like the rewards: renaming the promotion later does not rename this.
    title: str
    # What it takes off the order in money, in all (a promotion that only gives a gift: 0).
    discount_cents: int


class CartPromotionResponse(CamelModel):
    promotion_id: uuid.UUID
    slug: str
    title: str
    discount_cents: int
    gifts: list[GiftResponse]


class CartPromotionHintResponse(CamelModel):
    """«Ещё 300 сом до подарка»: a promotion the cart misses by money alone."""

    promotion_id: uuid.UUID
    slug: str
    title: str
    missing_cents: int


class CartPromotionsResponse(CamelModel):
    """What checkout would give this cart, from the same engine and arithmetic."""

    applied: list[CartPromotionResponse] = []
    hints: list[CartPromotionHintResponse] = []
    # Every applied promotion's gifts in one list, for drawing them after the lines.
    gifts: list[GiftResponse] = []
    items_discount_cents: int = 0
    order_discount_cents: int = 0
    discount_cents: int = 0
    # The cart's price × quantity after the promotions — the sum a checkout would charge.
    payable_cents: int = 0


class PromotionRefResponse(CamelModel):
    promotion_id: uuid.UUID
    title: str


def gift_response(gift: GiftSpec) -> GiftResponse:
    return GiftResponse(
        kind=gift.kind,
        title=gift.title,
        image_url=gift.image_url,
        product_id=gift.product_id,
        variant_id=gift.variant_id,
        quantity=gift.quantity,
    )


def cart_promotions_response(preview: CartPromotionsPreview) -> CartPromotionsResponse:
    return CartPromotionsResponse(
        applied=[
            CartPromotionResponse(
                promotion_id=entry.promotion.id,
                slug=entry.promotion.slug,
                title=entry.promotion.title,
                discount_cents=entry.discount_cents,
                gifts=[gift_response(gift) for gift in entry.gifts],
            )
            for entry in preview.applied
        ],
        hints=[
            CartPromotionHintResponse(
                promotion_id=hint.promotion.id,
                slug=hint.promotion.slug,
                title=hint.promotion.title,
                missing_cents=hint.missing_cents,
            )
            for hint in preview.hints
        ],
        gifts=[gift_response(gift) for gift in preview.gifts],
        items_discount_cents=preview.items_discount_cents,
        order_discount_cents=preview.order_discount_cents,
        discount_cents=preview.discount_cents,
        payable_cents=preview.payable_cents,
    )


def order_promotion_responses(order: Order, totals: OrderTotals) -> list[OrderPromotionResponse]:
    return [
        OrderPromotionResponse(
            id=participation.id,
            promotion_id=participation.promotion_id,
            promo_code_id=participation.promo_code_id,
            title=participation.title,
            discount_cents=totals.promo_by_layer.get(participation.id, 0),
        )
        for participation in order.promotions
        if participation.released_at is None
    ]


def order_gift_responses(order: Order) -> list[OrderGiftResponse]:
    return [
        OrderGiftResponse(
            id=gift.id,
            order_promotion_id=gift.order_promotion_id,
            kind=gift.kind,
            title=gift.title,
            image_url=gift.image_url,
            product_id=gift.product_id,
            variant_id=gift.variant_id,
            quantity=gift.quantity,
        )
        for gift in order.gifts
    ]
