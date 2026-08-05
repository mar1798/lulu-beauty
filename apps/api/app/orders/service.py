import uuid
from datetime import UTC, datetime

from sqlalchemy import Select, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import User
from app.cart.models import Cart, CartItem
from app.catalog.images import primary_image_url
from app.catalog.models import Product
from app.cycles.models import OrderCycle
from app.cycles.service import CyclesService
from app.orders.models import Order, OrderItem, OrderStatus


class NoActiveCycleError(Exception):
    pass


class EmptyCartError(Exception):
    pass


class OrderNotFoundError(Exception):
    pass


class OrderNotEditableError(Exception):
    """The customer's window has closed: the cycle deadline passed, or the owner moved

    the order out of PENDING and has already started buying against it.
    """


class OrderItemNotFoundError(Exception):
    pass


class LastOrderItemError(Exception):
    """Removing the only line would leave an order with nothing in it — cancel it instead."""


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
            .options(selectinload(Product.images))
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
                    product_slug=product.slug,
                    product_image_url=primary_image_url(product.images),
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

    async def editable_map(self, orders: list[Order]) -> dict[uuid.UUID, bool]:
        """Which of these orders the customer may still edit — one query for the whole page.

        The rule lives here, not in the frontend: it needs the cycle deadline, which the
        order itself doesn't carry, and both the API guard and the UI must agree on it.
        """
        cycle_ids = {order.cycle_id for order in orders}
        if not cycle_ids:
            return {}

        result = await self._session.execute(
            select(OrderCycle.id, OrderCycle.deadline_at).where(OrderCycle.id.in_(cycle_ids))
        )
        deadlines = {cycle_id: deadline for cycle_id, deadline in result.all()}
        now = datetime.now(UTC)

        return {
            order.id: order.status == OrderStatus.PENDING
            and (deadline := deadlines.get(order.cycle_id)) is not None
            and deadline > now
            for order in orders
        }

    async def _get_editable(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        order = await self.get_for_user(user_id, order_id)
        editable = await self.editable_map([order])
        if not editable[order.id]:
            raise OrderNotEditableError
        return order

    @staticmethod
    def _recalculate_total(order: Order) -> None:
        order.total_cents = sum(
            item.product_price_cents * item.quantity for item in order.items
        )

    @staticmethod
    def _find_item(order: Order, item_id: uuid.UUID) -> OrderItem:
        for item in order.items:
            if item.id == item_id:
                return item
        raise OrderItemNotFoundError

    async def set_item_quantity(
        self, user_id: uuid.UUID, order_id: uuid.UUID, item_id: uuid.UUID, quantity: int
    ) -> Order:
        order = await self._get_editable(user_id, order_id)
        item = self._find_item(order, item_id)

        item.quantity = quantity
        self._recalculate_total(order)
        await self._session.flush()
        return order

    async def remove_item(
        self, user_id: uuid.UUID, order_id: uuid.UUID, item_id: uuid.UUID
    ) -> Order:
        order = await self._get_editable(user_id, order_id)
        item = self._find_item(order, item_id)
        if len(order.items) == 1:
            raise LastOrderItemError

        order.items.remove(item)
        self._recalculate_total(order)
        await self._session.flush()
        return order

    async def update_note(
        self, user_id: uuid.UUID, order_id: uuid.UUID, note: str | None
    ) -> Order:
        order = await self._get_editable(user_id, order_id)
        order.note = note
        await self._session.flush()
        return order

    async def cancel(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        """Customer-side "delete": the owner keeps seeing the order, marked CANCELLED."""
        order = await self._get_editable(user_id, order_id)
        order.status = OrderStatus.CANCELLED
        await self._session.flush()
        return order

    async def delete(self, order_id: uuid.UUID) -> None:
        """Owner-side delete — really removes the order; items cascade with it."""
        order = await self._session.get(Order, order_id)
        if order is None:
            raise OrderNotFoundError

        await self._session.delete(order)

    def _admin_query(
        self, cycle_id: uuid.UUID | None, status: OrderStatus | None
    ) -> Select[tuple[Order]]:
        query = select(Order).options(selectinload(Order.items)).order_by(Order.created_at.desc())
        if cycle_id is not None:
            query = query.where(Order.cycle_id == cycle_id)
        if status is not None:
            query = query.where(Order.status == status)
        return query

    async def list_admin(
        self, cycle_id: uuid.UUID | None, status: OrderStatus | None = None
    ) -> list[Order]:
        """Unpaginated admin listing — the Excel export needs every matching order."""
        result = await self._session.execute(self._admin_query(cycle_id, status))
        return list(result.scalars().all())

    async def list_admin_page(
        self,
        cycle_id: uuid.UUID | None,
        status: OrderStatus | None,
        page: int,
        page_size: int,
    ) -> tuple[list[Order], int]:
        query = self._admin_query(cycle_id, status)
        total = (
            await self._session.scalar(
                select(func.count()).select_from(
                    self._admin_query(cycle_id, status).order_by(None).subquery()
                )
            )
            or 0
        )

        result = await self._session.execute(
            query.offset((page - 1) * page_size).limit(page_size)
        )
        return list(result.scalars().all()), total

    async def load_customers(self, orders: list[Order]) -> dict[uuid.UUID, User]:
        """Batch-load the users behind a set of orders (one query, not one per order)."""
        user_ids = {order.user_id for order in orders}
        if not user_ids:
            return {}

        result = await self._session.execute(select(User).where(User.id.in_(user_ids)))
        return {user.id: user for user in result.scalars().all()}

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
