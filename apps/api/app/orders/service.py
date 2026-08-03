import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart.models import Cart, CartItem
from app.catalog.models import Product
from app.cycles.service import CyclesService
from app.orders.models import Order, OrderItem, OrderStatus


class NoActiveCycleError(Exception):
    pass


class EmptyCartError(Exception):
    pass


class OrderNotFoundError(Exception):
    pass


class OrdersService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._cycles = CyclesService(session)

    async def checkout(self, user_id: uuid.UUID, note: str | None) -> Order:
        cycle = await self._cycles.get_active_cycle()
        if cycle is None:
            raise NoActiveCycleError

        result = await self._session.execute(
            select(Cart).where(Cart.user_id == user_id, Cart.cycle_id == cycle.id)
        )
        cart = result.scalar_one_or_none()
        if cart is None:
            raise EmptyCartError

        result = await self._session.execute(
            select(CartItem, Product)
            .join(Product, Product.id == CartItem.product_id)
            .where(CartItem.cart_id == cart.id)
        )
        rows = result.all()
        if not rows:
            raise EmptyCartError

        order = Order(user_id=user_id, cycle_id=cycle.id, status=OrderStatus.PENDING, note=note)
        total_cents = 0
        for cart_item, product in rows:
            line_total_cents = product.price_cents * cart_item.quantity
            total_cents += line_total_cents
            order.items.append(
                OrderItem(
                    product_id=product.id,
                    product_name=product.name,
                    product_price_cents=product.price_cents,
                    quantity=cart_item.quantity,
                )
            )
        order.total_cents = total_cents

        self._session.add(order)
        await self._session.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
        await self._session.flush()
        return order

    async def list_for_user(self, user_id: uuid.UUID) -> list[Order]:
        result = await self._session.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_for_user(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        result = await self._session.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_id, Order.user_id == user_id)
        )
        order = result.scalar_one_or_none()
        if order is None:
            raise OrderNotFoundError
        return order

    async def list_admin(self, cycle_id: uuid.UUID | None) -> list[Order]:
        query = select(Order).options(selectinload(Order.items)).order_by(Order.created_at.desc())
        if cycle_id is not None:
            query = query.where(Order.cycle_id == cycle_id)
        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def update_status(self, order_id: uuid.UUID, new_status: OrderStatus) -> Order:
        result = await self._session.execute(
            select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
        )
        order = result.scalar_one_or_none()
        if order is None:
            raise OrderNotFoundError

        order.status = new_status
        await self._session.flush()
        return order
