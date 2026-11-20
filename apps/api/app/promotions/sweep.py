"""What the promotion sweep (`scheduler._run_promotion_sweep`) looks for: read-only queries.

Kept apart from the notifications so the "what is due" rules can be tested without a bot.
Nothing here writes; stamping `announced_at` / `reminded_at` is the notifier's business,
after the message went out.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.promotions.models import PromoCode, PromoCodeStatus, Promotion

# How far ahead of `expires_at` the "скоро сгорит" reminder goes out.
EXPIRY_REMINDER_LEAD = timedelta(days=3)

# A code younger than this is not reminded about: the message that handed it over is still
# fresh, and a code issued with a short life would get both back to back.
EXPIRY_REMINDER_MIN_AGE = timedelta(days=1)

# One tick looks at this many codes; the rest wait for the next one.
REMINDER_BATCH = 200


async def unannounced_promotions(session: AsyncSession, now: datetime) -> list[uuid.UUID]:
    """Promotions that began, want announcing, and have not been told to anyone yet.

    A promotion that already ended is left alone: telling everyone about an offer that is
    over is worse than saying nothing. Oldest start first.
    """
    return list(
        (
            await session.scalars(
                select(Promotion.id)
                .where(
                    Promotion.announce.is_(True),
                    Promotion.is_enabled.is_(True),
                    Promotion.deleted_at.is_(None),
                    Promotion.announced_at.is_(None),
                    Promotion.starts_at <= now,
                    Promotion.ends_at > now,
                )
                .order_by(Promotion.starts_at, Promotion.id)
            )
        ).all()
    )


async def expiring_promo_codes(session: AsyncSession, now: datetime) -> list[PromoCode]:
    """Unused codes that run out within `EXPIRY_REMINDER_LEAD` and were not reminded yet."""
    return list(
        (
            await session.scalars(
                select(PromoCode)
                .where(
                    PromoCode.status == PromoCodeStatus.ACTIVE,
                    PromoCode.reminded_at.is_(None),
                    PromoCode.valid_from <= now,
                    PromoCode.expires_at > now,
                    PromoCode.expires_at <= now + EXPIRY_REMINDER_LEAD,
                    PromoCode.created_at <= now - EXPIRY_REMINDER_MIN_AGE,
                )
                .order_by(PromoCode.expires_at, PromoCode.id)
                .limit(REMINDER_BATCH)
            )
        ).all()
    )
