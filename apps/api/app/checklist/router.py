import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.checklist.schemas import ChecklistExtraRequest, ChecklistItem, extra_item
from app.checklist.service import ChecklistExtraNotFoundError, ChecklistExtrasService
from app.cycles.service import CycleNotFoundError
from app.db import get_session

router = APIRouter(tags=["checklist"])


@router.post(
    "/admin/checklist/extras", response_model=ChecklistItem, status_code=status.HTTP_201_CREATED
)
async def add_checklist_extra(
    body: ChecklistExtraRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ChecklistItem:
    """A line of the owner's own on the purchase list — not an order, nobody is told."""
    try:
        extra = await ChecklistExtrasService(session).add(
            body.cycle_id,
            name=body.name,
            quantity=body.quantity,
            unit_price_cents=body.unit_price_cents,
        )
    except CycleNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cycle_not_found") from error

    await session.commit()
    return extra_item(extra)


@router.delete("/admin/checklist/extras/{extra_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist_extra(
    extra_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    try:
        await ChecklistExtrasService(session).delete(extra_id)
    except ChecklistExtraNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "checklist_extra_not_found") from error

    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
