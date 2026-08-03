import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user, require_admin
from app.db import get_session
from app.orders.models import Order
from app.orders.schemas import (
    CheckoutRequest,
    OrderItemResponse,
    OrderResponse,
    OrderStatusUpdateRequest,
)
from app.orders.service import EmptyCartError, NoActiveCycleError, OrderNotFoundError, OrdersService

router = APIRouter(tags=["orders"])


def _order_response(order: Order) -> OrderResponse:
    return OrderResponse(
        id=order.id,
        cycle_id=order.cycle_id,
        status=order.status,
        total_cents=order.total_cents,
        note=order.note,
        created_at=order.created_at,
        items=[
            OrderItemResponse(
                product_id=item.product_id,
                product_name=item.product_name,
                product_price_cents=item.product_price_cents,
                quantity=item.quantity,
                line_total_cents=item.product_price_cents * item.quantity,
            )
            for item in order.items
        ],
    )


@router.post(
    "/orders/checkout", response_model=OrderResponse, status_code=status.HTTP_201_CREATED
)
async def checkout(
    body: CheckoutRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    try:
        order = await OrdersService(session).checkout(current_user.id, body.note)
    except NoActiveCycleError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_active_cycle") from error
    except EmptyCartError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "cart_is_empty") from error

    await session.commit()
    return _order_response(order)


@router.get("/orders", response_model=list[OrderResponse])
async def list_my_orders(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[OrderResponse]:
    orders = await OrdersService(session).list_for_user(current_user.id)
    return [_order_response(order) for order in orders]


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_my_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> OrderResponse:
    try:
        order = await OrdersService(session).get_for_user(current_user.id, order_id)
    except OrderNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "order_not_found") from error
    return _order_response(order)


@router.get("/admin/orders", response_model=list[OrderResponse])
async def list_orders_admin(
    cycle_id: uuid.UUID | None = Query(default=None, alias="cycleId"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> list[OrderResponse]:
    orders = await OrdersService(session).list_admin(cycle_id)
    return [_order_response(order) for order in orders]


@router.patch("/admin/orders/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: uuid.UUID,
    body: OrderStatusUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> OrderResponse:
    try:
        order = await OrdersService(session).update_status(order_id, body.status)
    except OrderNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "order_not_found") from error

    await session.commit()
    return _order_response(order)
