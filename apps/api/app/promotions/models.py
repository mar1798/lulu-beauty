import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db import Base
from app.promotions.rules import GiftKind


class PromotionStatus(enum.StrEnum):
    """What the admin table shows. Derived from the row and the clock, never stored."""

    DISABLED = "DISABLED"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    FINISHED = "FINISHED"
    ARCHIVED = "ARCHIVED"


class PromoCodeStatus(enum.StrEnum):
    # Issued and waiting to be used. Expiry is not a status: it is `expires_at` against
    # the clock, so no sweep has to walk the table to keep it true.
    ACTIVE = "ACTIVE"
    # Entered at checkout; the order holding it is not paid for yet.
    RESERVED = "RESERVED"
    # The order it was entered in was paid for.
    USED = "USED"
    # Taken back: the order that earned it was cancelled before the code was used.
    REVOKED = "REVOKED"


class Promotion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "promotions"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_promotions_window"),
        # The carousel and checkout both read "enabled, live, inside the window" — a
        # handful of rows, but on every cart look.
        Index(
            "ix_promotions_live_window",
            "starts_at",
            "ends_at",
            postgresql_where=text("deleted_at IS NULL AND is_enabled"),
        ),
    )

    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    # Cleaned by `catalog/rich_text.py`, like a product description.
    description_html: Mapped[str | None] = mapped_column(Text)
    # The carousel shows a promotion only with a mobile banner; the desktop one is
    # optional and the mobile one stands in for it.
    banner_mobile_url: Mapped[str | None] = mapped_column(String(2048))
    banner_desktop_url: Mapped[str | None] = mapped_column(String(2048))
    # The window is [starts_at, ends_at): a promotion ending at midnight is over at
    # midnight.
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_enabled: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
    # Whether everyone is told when it starts (`notify_promotion_started`).
    announce: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    # Stamped once that broadcast has gone out, the way `order_cycles.announced_at` is.
    announced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Typed lists, see `promotions/rules.py`. Read through `load_conditions` /
    # `load_rewards`, never as raw dicts.
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    rewards: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    # The carousel's order, and the order cart-wide discounts are taken in.
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    # Set instead of deleting a promotion somebody already took part in: the orders and
    # codes that point at it are a record, and a FK keeps them from losing it.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OrderPromotion(UUIDPrimaryKeyMixin, Base):
    """One order's part in one promotion — or its use of one promo code.

    The title and the rewards are snapshots: editing the promotion afterwards does not
    rewrite what an order was promised. `released_at` is set when the participation ends
    without the order (a cancellation, or a PENDING edit that stopped meeting the
    conditions) — the row stays as history, and the customer may take part again.
    """

    __tablename__ = "order_promotions"
    __table_args__ = (
        CheckConstraint(
            "(promotion_id IS NULL) <> (promo_code_id IS NULL)",
            name="ck_order_promotions_one_source",
        ),
        # «Один раз на покупателя», held by the database: two tabs checking out at once
        # cannot both join.
        Index(
            "uq_order_promotions_live_participant",
            "promotion_id",
            "user_id",
            unique=True,
            postgresql_where=text("released_at IS NULL AND promotion_id IS NOT NULL"),
        ),
        # A code is used by one live order at a time.
        Index(
            "uq_order_promotions_live_code",
            "promo_code_id",
            unique=True,
            postgresql_where=text("released_at IS NULL AND promo_code_id IS NOT NULL"),
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # No ON DELETE: a promotion anybody took part in is archived, never deleted.
    promotion_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("promotions.id"), index=True)
    promo_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("promo_codes.id"))
    title: Mapped[str] = mapped_column(String(255))
    rewards: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    # The promotion's `sort_order` when the order joined — a snapshot like the rewards, so
    # cart-wide discounts are taken in the same order `order_totals` reads without asking
    # the promotion.
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    # Which order lines each line-targeted `DISCOUNT` reward landed on: reward index (as a
    # string) -> order item ids. Resolved against the catalogue when the order joins and
    # on every PENDING recount, and frozen with the rest from the bill on — the arithmetic
    # then never needs the catalogue (`orders/discounts.py`). A reward without an entry is
    # cart-wide. NULL when there is nothing line-targeted.
    item_scopes: Mapped[dict[str, list[str]] | None] = mapped_column(JSONB)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrderGift(UUIDPrimaryKeyMixin, Base):
    """A gift going out with an order.

    A table of its own rather than an `order_items` line priced at zero: a gift touches
    none of the order's arithmetic, its export, its composition edits or the statuses
    that allow them.
    """

    __tablename__ = "order_gifts"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    order_promotion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_promotions.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[GiftKind] = mapped_column(SAEnum(GiftKind, name="gift_kind"))
    title: Mapped[str] = mapped_column(String(255))
    image_url: Mapped[str | None] = mapped_column(String(2048))
    # Set for a catalogue gift; NULL for a custom one, and once the product is gone —
    # the title and picture above are what keep the line readable then.
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL")
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL")
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1)


class PromoCode(UUIDPrimaryKeyMixin, Base):
    """A personal one-off code a paid-for order earned.

    Its conditions and rewards are copied from the promotion's template when it is issued,
    so the code means what it meant on the day it was given.
    """

    __tablename__ = "promo_codes"
    __table_args__ = (
        CheckConstraint("expires_at > valid_from", name="ck_promo_codes_window"),
        # One standing code per customer per promotion, which is what makes issuing it
        # idempotent. A revoked one does not count: the customer may earn it again with
        # another order.
        Index(
            "uq_promo_codes_live_owner",
            "promotion_id",
            "user_id",
            unique=True,
            postgresql_where=text("status <> 'REVOKED'"),
        ),
        # The reminder sweep looks for live codes running out.
        Index(
            "ix_promo_codes_active_expiry",
            "expires_at",
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    # Eight characters without the look-alikes (0/O, 1/I), upper case.
    code: Mapped[str] = mapped_column(String(16), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    promotion_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("promotions.id"))
    # The order that earned it. SET NULL: the admin may delete an order, the code stays.
    source_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    rewards: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[PromoCodeStatus] = mapped_column(
        SAEnum(PromoCodeStatus, name="promo_code_status"), default=PromoCodeStatus.ACTIVE
    )
    used_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL")
    )
    # Stamped once the "код скоро сгорит" reminder went out.
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def promotion_status(promotion: Promotion, now: datetime) -> PromotionStatus:
    if promotion.deleted_at is not None:
        return PromotionStatus.ARCHIVED
    if not promotion.is_enabled:
        return PromotionStatus.DISABLED
    if now < promotion.starts_at:
        return PromotionStatus.SCHEDULED
    if now >= promotion.ends_at:
        return PromotionStatus.FINISHED
    return PromotionStatus.ACTIVE
