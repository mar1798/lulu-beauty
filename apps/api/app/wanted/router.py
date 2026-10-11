from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_live_user
from app.db import get_session
from app.telegram.notify import notify_wanted_product
from app.wanted.schemas import WantedProductRequest, WantedProductResponse
from app.wanted.service import AccountGoneError, WantedProductsService

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
    current_user: CurrentUser = Depends(require_live_user),
) -> WantedProductResponse:
    """Someone searched, found nothing, and said what they were after.

    Signed-in customers only. The form still sits under a search that works without an
    account, but a guest sees a sign-in button there instead: a name and a number typed
    into a public form are whatever the writer chose to type, and the owner answers these
    by dialling it. The account's contact is one the bot has vouched for. Live rather
    than merely authenticated — an erased account's token outlives it by up to fifteen
    minutes, and its row has no name or number left to pass on.
    """
    try:
        wanted = await WantedProductsService(session).submit(
            message=body.message, user_id=current_user.id
        )
    except AccountGoneError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not_authenticated") from error

    await session.commit()
    background_tasks.add_task(notify_wanted_product, wanted.id)
    return WantedProductResponse(id=wanted.id, created_at=wanted.created_at)
