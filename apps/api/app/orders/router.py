import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user, require_admin
from app.auth.models import User
from app.common.schemas import PageResponse
from app.db import get_session
from app.orders.models import Order, OrderStatus
from app.orders.schemas import (
    AdminOrderResponse,
    CheckoutRequest,
    OrderItemAddRequest,
    OrderItemQuantityRequest,
    OrderItemResponse,
    OrderNoteUpdateRequest,
    OrderResponse,
    OrderStatusUpdateRequest,
)
from app.orders.service import (
    EmptyCartError,
    LastOrderItemError,
    NoActiveCycleError,
    OrderFlags,
    OrderItemNotFoundError,
    OrderNotEditableError,
    OrderNotFoundError,
    OrderNotRestorableError,
    OrdersService,
    ProductNotFoundError,
)
from app.telegram.notify import notify_new_order, notify_order_status

router = APIRouter(tags=["orders"])


def _order_items(order: Order) -> list[OrderItemResponse]:
    return [
        OrderItemResponse(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product_name,
            product_slug=item.product_slug,
            product_image_url=item.product_image_url,
            product_price_cents=item.product_price_cents,
            quantity=item.quantity,
            line_total_cents=item.product_price_cents * item.quantity,
        )
        for item in order.items
    ]


# An order nobody may act on — the admin view, where neither flag has a meaning.
_NO_ACTIONS = OrderFlags(is_editable=False, is_restorable=False)


def _order_response(order: Order, flags: OrderFlags = _NO_ACTIONS) -> OrderResponse:
    return OrderResponse(
        id=order.id,
        cycle_id=order.cycle_id,
        status=order.status,
        total_cents=order.total_cents,
        note=order.note,
        created_at=order.created_at,
        items=_order_items(order),
        is_editable=flags.is_editable,
        is_restorable=flags.is_restorable,
    )


async def _one_order_response(service: OrdersService, order: Order) -> OrderResponse:
    """Response for a single order, with the flags the customer's UI branches on."""
    flags = await service.customer_flags([order])
    return _order_response(order, flags.get(order.id, _NO_ACTIONS))


def _admin_order_response(order: Order, customer: User | None) -> AdminOrderResponse:
    return AdminOrderResponse(
        id=order.id,
        cycle_id=order.cycle_id,
        status=order.status,
        total_cents=order.total_cents,
        note=order.note,
        created_at=order.created_at,
        items=_order_items(order),
        # A deleted user cascades its orders away, so this is defensive only.
        customer_name=customer.name if customer is not None else "—",
        customer_phone=customer.phone if customer is not None else "—",
    )


@router.post(
    "/orders/checkout", response_model=OrderResponse, status_code=status.HTTP_201_CREATED
)
async def checkout(
    body: CheckoutRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    service = OrdersService(session)
    try:
        order = await service.checkout(current_user.id, body.note)
    except NoActiveCycleError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_active_cycle") from error
    except EmptyCartError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "cart_is_empty") from error

    response = await _one_order_response(service, order)
    await session.commit()
    background_tasks.add_task(notify_new_order, order.id)
    return response


@router.get("/orders", response_model=list[OrderResponse])
async def list_my_orders(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[OrderResponse]:
    service = OrdersService(session)
    orders = await service.list_for_user(current_user.id)
    flags = await service.customer_flags(orders)
    return [_order_response(order, flags.get(order.id, _NO_ACTIONS)) for order in orders]


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_my_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    service = OrdersService(session)
    try:
        order = await service.get_for_user(current_user.id, order_id)
    except OrderNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "order_not_found") from error
    return await _one_order_response(service, order)


def _editing_error(error: Exception) -> HTTPException:
    """Maps the service's editing failures onto status codes the frontend branches on."""
    if isinstance(error, OrderNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "order_not_found")
    if isinstance(error, OrderItemNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "order_item_not_found")
    if isinstance(error, LastOrderItemError):
        return HTTPException(status.HTTP_409_CONFLICT, "last_order_item")
    if isinstance(error, ProductNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found")
    if isinstance(error, OrderNotRestorableError):
        return HTTPException(status.HTTP_409_CONFLICT, "order_not_restorable")
    return HTTPException(status.HTTP_409_CONFLICT, "order_not_editable")


@router.patch("/orders/{order_id}", response_model=OrderResponse)
async def update_my_order_note(
    order_id: uuid.UUID,
    body: OrderNoteUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    service = OrdersService(session)
    try:
        order = await service.update_note(current_user.id, order_id, body.note)
    except (OrderNotFoundError, OrderNotEditableError) as error:
        raise _editing_error(error) from error

    response = await _one_order_response(service, order)
    await session.commit()
    return response


@router.post(
    "/orders/{order_id}/items",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_my_order_item(
    order_id: uuid.UUID,
    body: OrderItemAddRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    """Adds a product to an order that's already been placed — not via the cart.

    The cart feeds the *next* order, so it can't be the route here: the customer who
    forgot something would otherwise have to place a second request for one item.
    """
    service = OrdersService(session)
    try:
        order = await service.add_item(current_user.id, order_id, body.product_id, body.quantity)
    except (OrderNotFoundError, OrderNotEditableError, ProductNotFoundError) as error:
        raise _editing_error(error) from error

    response = await _one_order_response(service, order)
    await session.commit()
    return response


@router.patch("/orders/{order_id}/items/{item_id}", response_model=OrderResponse)
async def update_my_order_item(
    order_id: uuid.UUID,
    item_id: uuid.UUID,
    body: OrderItemQuantityRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    service = OrdersService(session)
    try:
        order = await service.set_item_quantity(current_user.id, order_id, item_id, body.quantity)
    except (OrderNotFoundError, OrderNotEditableError, OrderItemNotFoundError) as error:
        raise _editing_error(error) from error

    response = await _one_order_response(service, order)
    await session.commit()
    return response


@router.delete("/orders/{order_id}/items/{item_id}", response_model=OrderResponse)
async def remove_my_order_item(
    order_id: uuid.UUID,
    item_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    service = OrdersService(session)
    try:
        order = await service.remove_item(current_user.id, order_id, item_id)
    except (
        OrderNotFoundError,
        OrderNotEditableError,
        OrderItemNotFoundError,
        LastOrderItemError,
    ) as error:
        raise _editing_error(error) from error

    response = await _one_order_response(service, order)
    await session.commit()
    return response


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
async def cancel_my_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    service = OrdersService(session)
    try:
        order = await service.cancel(current_user.id, order_id)
    except (OrderNotFoundError, OrderNotEditableError) as error:
        raise _editing_error(error) from error

    response = await _one_order_response(service, order)
    await session.commit()
    return response


@router.post("/orders/{order_id}/restore", response_model=OrderResponse)
async def restore_my_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    """Undoes the customer's own cancellation while the cycle is still collecting.

    Cancelling by mistake used to be final — the only way back was placing the whole
    request again. Nothing is bought against a cancelled order, so before the deadline
    there's nothing to undo but a status.
    """
    service = OrdersService(session)
    try:
        order = await service.restore(current_user.id, order_id)
    except (OrderNotFoundError, OrderNotRestorableError) as error:
        raise _editing_error(error) from error

    response = await _one_order_response(service, order)
    await session.commit()
    return response


@router.get("/admin/orders", response_model=PageResponse[AdminOrderResponse])
async def list_orders_admin(
    cycle_id: uuid.UUID | None = Query(default=None, alias="cycleId"),
    order_status: OrderStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> PageResponse[AdminOrderResponse]:
    service = OrdersService(session)
    orders, total = await service.list_admin_page(cycle_id, order_status, page, page_size)
    customers = await service.load_customers(orders)
    return PageResponse(
        items=[_admin_order_response(order, customers.get(order.user_id)) for order in orders],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/admin/orders/{order_id}/status", response_model=AdminOrderResponse)
async def update_order_status(
    order_id: uuid.UUID,
    body: OrderStatusUpdateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminOrderResponse:
    service = OrdersService(session)
    try:
        order, changed = await service.update_status(order_id, body.status)
    except OrderNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "order_not_found") from error

    customers = await service.load_customers([order])
    await session.commit()
    if changed:
        background_tasks.add_task(notify_order_status, order.id)
    return _admin_order_response(order, customers.get(order.user_id))


@router.delete("/admin/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order_admin(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> None:
    """Owner-side removal — unlike the customer's cancel, this really deletes the order."""
    try:
        await OrdersService(session).delete(order_id)
    except OrderNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "order_not_found") from error

    await session.commit()
