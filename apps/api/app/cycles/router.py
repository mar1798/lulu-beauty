import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.cycles.models import OrderCycle
from app.cycles.schemas import CycleCreateRequest, CycleUpdateRequest, OrderCycleResponse
from app.cycles.service import (
    CycleHasOrdersError,
    CycleNotFoundError,
    CyclesService,
    PastDeadlineError,
)
from app.db import get_session
from app.telegram.notify import notify_cycle_opened

router = APIRouter(tags=["cycles"])


def _cycle_response(cycle: OrderCycle) -> OrderCycleResponse:
    return OrderCycleResponse(
        id=cycle.id,
        deadline_at=cycle.deadline_at,
        label=cycle.label,
        status=cycle.status,
        reminder_sent_at=cycle.reminder_sent_at,
        closed_at=cycle.closed_at,
    )


@router.get("/cycles/active", response_model=OrderCycleResponse)
async def get_active_cycle(session: AsyncSession = Depends(get_session)) -> OrderCycleResponse:
    cycle = await CyclesService(session).get_active_cycle()
    if cycle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no_active_cycle")
    return _cycle_response(cycle)


@router.get("/admin/cycles", response_model=list[OrderCycleResponse])
async def list_cycles(
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> list[OrderCycleResponse]:
    cycles = await CyclesService(session).list()
    return [_cycle_response(cycle) for cycle in cycles]


@router.post(
    "/admin/cycles", response_model=OrderCycleResponse, status_code=status.HTTP_201_CREATED
)
async def create_cycle(
    body: CycleCreateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> OrderCycleResponse:
    try:
        cycle = await CyclesService(session).create(body.deadline_at, body.label)
    except PastDeadlineError as error:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "deadline_must_be_future"
        ) from error

    await session.commit()
    # In the background, and with its own session: the announcement is a throttled
    # fan-out over every linked customer, and the owner shouldn't sit through it to find
    # out whether their cycle was created.
    background_tasks.add_task(notify_cycle_opened, cycle.id)
    return _cycle_response(cycle)


@router.patch("/admin/cycles/{cycle_id}", response_model=OrderCycleResponse)
async def update_cycle(
    cycle_id: uuid.UUID,
    body: CycleUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> OrderCycleResponse:
    updates = body.model_dump(exclude_unset=True)
    try:
        cycle = await CyclesService(session).update(cycle_id, updates)
    except CycleNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cycle_not_found") from error

    await session.commit()
    return _cycle_response(cycle)


@router.delete("/admin/cycles/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cycle(
    cycle_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> None:
    try:
        await CyclesService(session).delete(cycle_id)
    except CycleNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cycle_not_found") from error
    except CycleHasOrdersError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "cycle_has_orders") from error

    await session.commit()
