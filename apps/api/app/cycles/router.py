import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.cycles.models import CycleStatus, OrderCycle
from app.cycles.scheduler_service import CycleSchedulerService
from app.cycles.schemas import CycleCreateRequest, CycleUpdateRequest, OrderCycleResponse
from app.cycles.service import (
    ActiveCycleExistsError,
    CycleAlreadyClosedError,
    CycleHasOrdersError,
    CycleNotFoundError,
    CyclesService,
    PastDeadlineError,
)
from app.db import get_session
from app.telegram.notify import (
    notify_carts_rescued,
    notify_cycle_closed,
    notify_cycle_closed_for_customers,
    notify_cycle_deadline_changed,
    notify_cycle_opened,
)

router = APIRouter(tags=["cycles"])


def _cycle_response(cycle: OrderCycle) -> OrderCycleResponse:
    return OrderCycleResponse(
        id=cycle.id,
        deadline_at=cycle.deadline_at,
        label=cycle.label,
        status=cycle.status,
        reminder_sent_at=cycle.reminder_sent_at,
        final_reminder_sent_at=cycle.final_reminder_sent_at,
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
    except ActiveCycleExistsError as error:
        # Not a race but a rule: one cycle collects at a time (see ActiveCycleExistsError).
        raise HTTPException(status.HTTP_409_CONFLICT, "active_cycle_exists") from error

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
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> OrderCycleResponse:
    updates = body.model_dump(exclude_unset=True)
    service = CyclesService(session)

    # Read before the update, not after: the row is about to hold the new deadline, and
    # the notification below is about the difference between the two.
    existing = await service.get(cycle_id)
    previous_deadline_at = existing.deadline_at if existing is not None else None

    try:
        cycle = await service.update(cycle_id, updates)
    except CycleNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cycle_not_found") from error
    except PastDeadlineError as error:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "deadline_must_be_future"
        ) from error
    except ActiveCycleExistsError as error:
        # Reopening a finished cycle while another one is collecting — the same 409 (and
        # the same message) creating a second cycle gets, because it is the same rule.
        raise HTTPException(status.HTTP_409_CONFLICT, "active_cycle_exists") from error

    response = _cycle_response(cycle)
    await session.commit()

    # Only a moved deadline, and only on a cycle that is still collecting: renaming one
    # changes nothing for the customer, and a past cycle's date is bookkeeping. Same
    # background fan-out as the opening announcement, for the same reason.
    if (
        previous_deadline_at is not None
        and cycle.deadline_at != previous_deadline_at
        and cycle.status is not CycleStatus.CLOSED
    ):
        background_tasks.add_task(notify_cycle_deadline_changed, cycle.id, previous_deadline_at)

    return response


@router.post("/admin/cycles/{cycle_id}/close", response_model=OrderCycleResponse)
async def close_cycle(
    cycle_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> OrderCycleResponse:
    """Closes a cycle early — everything the deadline would have done, on demand.

    Notifications go out after the commit and *in this request*, not as a background
    task: the owner pressed the button and is looking at the answer, and the closing
    tally is the thing they pressed it for.
    """
    service = CycleSchedulerService(session)
    try:
        closure = await service.close_now(cycle_id)
    except CycleNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cycle_not_found") from error
    except CycleAlreadyClosedError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "cycle_already_closed") from error

    response = _cycle_response(closure.cycle)
    await session.commit()
    await notify_cycle_closed(session, closure.cycle, closure.orders_count, closure.total_cents)
    await notify_carts_rescued(session, closure.cycle, closure.rescued_carts)
    await notify_cycle_closed_for_customers(session, closure.cycle)
    return response


@router.delete("/admin/cycles/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cycle(
    cycle_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> None:
    """Removes a cycle that never came to anything — rescuing whatever was in its carts.

    `carts.cycle_id` is ON DELETE CASCADE, so without the rescue a delete took every cart
    in the cycle down with it, silently and with no wishlist to show for it — the one
    thing the deadline path is careful never to do.
    """
    service = CyclesService(session)
    cycle = await service.get(cycle_id)
    if cycle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cycle_not_found")

    rescues = await CycleSchedulerService(session).rescue_carts(cycle)
    try:
        await service.delete(cycle_id)
    except CycleNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cycle_not_found") from error
    except CycleHasOrdersError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "cycle_has_orders") from error

    await session.commit()
    await notify_carts_rescued(session, cycle, rescues)
