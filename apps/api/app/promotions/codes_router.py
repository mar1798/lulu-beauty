from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.db import get_session
from app.promotions.code_schemas import PromoCodeResponse, promo_code_response
from app.promotions.codes import PromoCodesService

router = APIRouter(tags=["promo-codes"])


@router.get("/me/promo-codes", response_model=list[PromoCodeResponse])
async def list_my_promo_codes(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[PromoCodeResponse]:
    """Every code the customer has ever been given, with the status as of now.

    Revoked ones included: the page shows why a code is gone. Not paginated — a customer
    earns one code per promotion they took part in, which is a handful.
    """
    now = datetime.now(UTC)
    rows = await PromoCodesService(session).list_for_user(current_user.id)
    return [promo_code_response(code, title, now) for code, title in rows]
