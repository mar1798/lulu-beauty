from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_optional_user
from app.db import get_session
from app.telegram.notify import notify_wanted_product
from app.wanted.schemas import WantedProductRequest, WantedProductResponse
from app.wanted.service import ContactRequiredError, WantedProductsService

router = APIRouter(tags=["wanted"])


@router.post(
    "/wanted-products",
    response_model=WantedProductResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_wanted_product(
    body: WantedProductRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser | None = Depends(get_optional_user),
) -> WantedProductResponse:
    """Someone searched, found nothing, and said what they were after.

    Open to guests on purpose: it sits under the search on the catalog and in the header,
    both of which work without an account, and asking a person to sign in before they may
    say what is missing would collect nothing. The strict rate-limit budget applies instead
    (`common/rate_limit.py`) — it is the second anonymous endpoint that writes rows.
    """
    try:
        wanted = await WantedProductsService(session).submit(
            message=body.message,
            user_id=None if current_user is None else current_user.id,
            name=body.name,
            phone=body.phone,
        )
    except ContactRequiredError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "contact_required") from error

    await session.commit()
    background_tasks.add_task(notify_wanted_product, wanted.id)
    return WantedProductResponse(id=wanted.id, created_at=wanted.created_at)
