import uuid
from dataclasses import dataclass
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
from app.orders.schemas import MAX_ITEM_QUANTITY


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


class ProductNotFoundError(Exception):
    """No live product behind the id — it was soft-deleted between the search and the click."""


class OrderNotRestorableError(Exception):
    """Nothing to undo, or the window to undo it in has closed.

    Either the order isn't CANCELLED at all, or the cycle deadline has passed and the
    owner is already buying against the list this order is no longer on.
    """


@dataclass(frozen=True)
class OrderFlags:
    """What the customer may still do with an order.

    Both answers hang off the same fact — whether the cycle deadline has passed — so
    they're computed together, from one query, and travel to the UI together.
    """

    is_editable: bool
    is_restorable: bool


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

        # Same filter as the cart response: a product discontinued between the last look
        # at the cart and this click is not in the cart the customer is looking at, and
        # add_item refuses to put one into an order — checkout must not be the one way in.
        result = await self._session.execute(
            select(CartItem, Product)
            .join(Product, Product.id == CartItem.product_id)
            .where(CartItem.cart_id == cart.id, Product.deleted_at.is_(None))
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

    async def _open_cycle_ids(self, orders: list[Order]) -> set[uuid.UUID]:
        """Of the cycles behind these orders, the ones still collecting — one query."""
        cycle_ids = {order.cycle_id for order in orders}
        if not cycle_ids:
            return set()

        result = await self._session.execute(
            select(OrderCycle.id).where(
                OrderCycle.id.in_(cycle_ids), OrderCycle.deadline_at > datetime.now(UTC)
            )
        )
        return set(result.scalars().all())

    async def customer_flags(self, orders: list[Order]) -> dict[uuid.UUID, OrderFlags]:
        """What the customer may still do with each of these orders — one query per page.

        The rules live here, not in the frontend: they need the cycle deadline, which the
        order itself doesn't carry, and the API guards and the UI must agree on them.
        """
        open_cycles = await self._open_cycle_ids(orders)

        return {
            order.id: OrderFlags(
                is_editable=order.status == OrderStatus.PENDING
                and order.cycle_id in open_cycles,
                is_restorable=order.status == OrderStatus.CANCELLED
                and order.cycle_id in open_cycles,
            )
            for order in orders
        }

    async def _flags_for(self, order: Order) -> OrderFlags:
        return (await self.customer_flags([order]))[order.id]

    async def _get_editable(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        order = await self.get_for_user(user_id, order_id)
        if not (await self._flags_for(order)).is_editable:
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

    async def add_item(
        self, user_id: uuid.UUID, order_id: uuid.UUID, product_id: uuid.UUID, quantity: int
    ) -> Order:
        """Add a product to an order that's already been placed.

        The snapshot is taken now, from the current catalog — this line joins the order
        today, so today's price is the one the customer is agreeing to. Lines that were
        already there keep the price they were checked out with.
        """
        order = await self._get_editable(user_id, order_id)

        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id, Product.deleted_at.is_(None))
            .options(selectinload(Product.images))
        )
        product = result.scalar_one_or_none()
        if product is None:
            raise ProductNotFoundError

        existing = next((item for item in order.items if item.product_id == product.id), None)
        if existing is not None:
            # One line per product, as at checkout: a second row for the same thing would
            # be the owner's problem to reconcile by hand. The clamp is a ceiling, not a
            # rule worth an error — nobody means 1000 of anything here.
            existing.quantity = min(existing.quantity + quantity, MAX_ITEM_QUANTITY)
        else:
            order.items.append(
                OrderItem(
                    product_id=product.id,
                    product_name=product.name,
                    product_slug=product.slug,
                    product_image_url=primary_image_url(product.images),
                    product_price_cents=product.price_cents,
                    quantity=quantity,
                )
            )

        self._recalculate_total(order)
        await self._session.flush()
        return order

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

    async def restore(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        """Undo a cancellation while the cycle is still collecting.

        Cancelling is something the customer does to themselves, and nothing is bought
        against a cancelled order — so putting it back costs the owner nothing as long
        as the deadline hasn't passed. The order returns to PENDING exactly as it was:
        cancelling never touched the lines or their snapshot prices.

        The order doesn't record *who* cancelled it, so an owner-side cancellation is
        restorable too. That's deliberate: the owner's way of making an order stay gone
        is deleting it, not leaving it in a status the customer can walk out of.
        """
        order = await self.get_for_user(user_id, order_id)
        if not (await self._flags_for(order)).is_restorable:
            raise OrderNotRestorableError

        order.status = OrderStatus.PENDING
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

    async def update_status(
        self, order_id: uuid.UUID, new_status: OrderStatus
    ) -> tuple[Order, bool]:
        """Returns the order and whether the status actually moved.

        The owner's UI lets them press the status they're already on, and re-sending
        "готова к выдаче" to the customer every time they do would train them to ignore
        the bot. Only the service can tell — the caller never sees the previous value.
        """
        result = await self._session.execute(
            select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
        )
        order = result.scalar_one_or_none()
        if order is None:
            raise OrderNotFoundError

        changed = order.status != new_status
        order.status = new_status
        await self._session.flush()
        return order, changed
