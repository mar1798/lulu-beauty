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
from app.cycles.models import CycleStatus, OrderCycle
from app.cycles.service import CyclesService
from app.orders.models import CANCELLED_STATUSES, Order, OrderItem, OrderStatus
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

    Either the order isn't cancelled at all, or the cycle deadline has passed and the
    owner is already buying against the list this order is no longer on.
    """


class StatusNotAssignableError(Exception):
    """The owner tried to set a status that is not theirs to set.

    CANCELLED_BY_CUSTOMER is a statement about what the customer did; the owner putting
    it on an order would be putting words in their mouth. Theirs is CANCELLED_BY_OWNER.
    """


@dataclass(frozen=True)
class OrderFlags:
    """What the customer may still do with an order.

    Both answers hang off the same fact — whether the cycle deadline has passed — so
    they're computed together, from one query, and travel to the UI together.
    """

    is_editable: bool
    is_restorable: bool


@dataclass(frozen=True)
class OrderPriceChange:
    """A pending order whose line was repriced by a catalog edit.

    Travels by value for the same reason `DeletedOrder` does: the notification runs after
    the commit, and the price the customer has to be told about — the old one — is exactly
    what the row no longer holds.
    """

    order_id: uuid.UUID
    user_id: uuid.UUID
    product_name: str
    old_price_cents: int
    new_price_cents: int
    total_cents: int


@dataclass(frozen=True)
class OrderItemDrop:
    """A pending order that lost a line because the product left the catalog."""

    order_id: uuid.UUID
    user_id: uuid.UUID
    product_name: str
    total_cents: int
    # The dropped line was the only one: an order with nothing in it is not an order, so
    # it is cancelled rather than left empty — and that is different news for the customer.
    is_cancelled: bool


@dataclass(frozen=True)
class DeletedOrder:
    """Who to notify about a deletion, and what the order was at the moment of it.

    Every other order notification re-reads its row after the commit; this one can't —
    the row is the thing that was deleted. So the few facts the message needs travel out
    of the transaction by value instead.
    """

    order_id: uuid.UUID
    user_id: uuid.UUID
    status: OrderStatus


class OrdersService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._cycles = CyclesService(session)

    async def checkout(self, user_id: uuid.UUID, note: str | None) -> Order:
        cycle = await self._cycles.get_active_cycle()
        if cycle is None:
            raise NoActiveCycleError

        # Locked, because the cart row is what makes a checkout unique. Two clicks on
        # "оформить" (a double tap, a retry on a slow response) are two transactions that
        # both read the same lines and both write a full-price order out of them — the
        # customer gets one list, the owner gets two identical заявки and buys twice.
        # The second transaction now waits here, and by the time it reads the items the
        # winner has already emptied them, so it raises EmptyCartError instead.
        result = await self._session.execute(
            select(Cart)
            .where(Cart.user_id == user_id, Cart.cycle_id == cycle.id)
            .with_for_update()
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

    async def list_for_user(
        self, user_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> tuple[list[Order], int]:
        """One page of the customer's own orders, newest first, plus the total.

        Paginated because nothing bounded this: a customer who has ordered in every cycle
        for a year got the lot — with every line item of every order — in one response.
        The total comes back so the caller can say how much more there is (the bot's
        "…и ещё N" line, the site's pager) without asking for the rest.
        """
        total = (
            await self._session.scalar(
                select(func.count()).select_from(Order).where(Order.user_id == user_id)
            )
            or 0
        )
        result = await self._session.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

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
                OrderCycle.id.in_(cycle_ids),
                OrderCycle.deadline_at > datetime.now(UTC),
                # Closed early by the owner: the deadline hasn't arrived, but the shopping
                # list has already been drawn up, and editing an order against it now
                # would change what the owner is out buying.
                OrderCycle.status != CycleStatus.CLOSED,
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
                is_editable=order.status == OrderStatus.PENDING and order.cycle_id in open_cycles,
                # `order.items` too: an order cancelled because its last product left the
                # catalog (see `drop_product`) has nothing to come back to, and offering
                # the button would only earn a 409.
                is_restorable=order.status in CANCELLED_STATUSES
                and order.cycle_id in open_cycles
                and bool(order.items),
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
        order.total_cents = sum(item.product_price_cents * item.quantity for item in order.items)

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

    async def update_note(self, user_id: uuid.UUID, order_id: uuid.UUID, note: str | None) -> Order:
        order = await self._get_editable(user_id, order_id)
        order.note = note
        await self._session.flush()
        return order

    async def cancel(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        """Customer-side "delete": the owner keeps seeing the order, marked as cancelled
        *by the customer* — which is the whole difference from the owner dropping it."""
        order = await self._get_editable(user_id, order_id)
        order.status = OrderStatus.CANCELLED_BY_CUSTOMER
        await self._session.flush()
        return order

    async def restore(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        """Undo a cancellation while the cycle is still collecting.

        Cancelling is something the customer does to themselves, and nothing is bought
        against a cancelled order — so putting it back costs the owner nothing as long
        as the deadline hasn't passed. The order returns to PENDING exactly as it was:
        cancelling never touched the lines or their snapshot prices.

        An owner-side cancellation is restorable too, even though the order now records
        who ended it. That's deliberate: the owner's way of making an order stay gone is
        deleting it, not leaving it in a status the customer can walk out of.
        """
        order = await self.get_for_user(user_id, order_id)
        if not (await self._flags_for(order)).is_restorable:
            raise OrderNotRestorableError
        # Nothing left to restore: the cancellation came from `drop_product` taking the
        # order's last line out of the catalog, and an empty PENDING order is a state
        # neither the site nor the owner's list can do anything with.
        if not order.items:
            raise OrderNotRestorableError

        order.status = OrderStatus.PENDING
        await self._session.flush()
        return order

    async def delete(self, order_id: uuid.UUID) -> DeletedOrder:
        """Owner-side delete — really removes the order; items cascade with it.

        Returns what the customer has to be told, because after the commit there is
        nothing left to look it up from (see `DeletedOrder`).
        """
        order = await self._session.get(Order, order_id)
        if order is None:
            raise OrderNotFoundError

        deleted = DeletedOrder(order_id=order.id, user_id=order.user_id, status=order.status)
        await self._session.delete(order)
        return deleted

    async def _pending_orders_with(self, product_id: uuid.UUID) -> list[Order]:
        """Orders still awaiting confirmation that contain the product.

        PENDING only, whatever cycle they belong to: past that status the owner has
        already bought against the list, and a catalog edit made afterwards must not
        rewrite what was agreed. A subquery rather than a join so `selectinload` still
        gets whole orders — the totals are recomputed from *all* of their lines.
        """
        result = await self._session.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(
                Order.status == OrderStatus.PENDING,
                Order.id.in_(
                    select(OrderItem.order_id).where(OrderItem.product_id == product_id)
                ),
            )
        )
        return list(result.scalars().all())

    async def reprice_product(
        self, product_id: uuid.UUID, price_cents: int
    ) -> list[OrderPriceChange]:
        """Pulls a catalog price change through every order still awaiting confirmation.

        Lines are snapshots on purpose (`OrderItem` denormalises name and price at
        checkout), and that stays true for everything the owner has already confirmed.
        But while an order is PENDING nothing has been bought yet, and the owner charging one
        price while the customer's order shows another is the worse inconsistency.

        Returns what each affected customer has to be told; the caller commits first and
        notifies after (see `app/telegram/notify.py`).
        """
        changes: list[OrderPriceChange] = []

        for order in await self._pending_orders_with(product_id):
            for item in order.items:
                if item.product_id != product_id or item.product_price_cents == price_cents:
                    continue

                old_price_cents = item.product_price_cents
                item.product_price_cents = price_cents
                self._recalculate_total(order)
                changes.append(
                    OrderPriceChange(
                        order_id=order.id,
                        user_id=order.user_id,
                        product_name=item.product_name,
                        old_price_cents=old_price_cents,
                        new_price_cents=price_cents,
                        total_cents=order.total_cents,
                    )
                )

        if changes:
            await self._session.flush()
        return changes

    async def drop_product(self, product_id: uuid.UUID) -> list[OrderItemDrop]:
        """Takes a product out of every order still awaiting confirmation.

        Follows a soft-delete in the catalog: the owner isn't going to buy the thing, so
        leaving the line in would have them reconciling a list they can't fulfil.
        Confirmed and later orders keep their lines — those are a record of what was
        agreed, and the product row itself survives the soft-delete to back them.

        An order left with no lines is cancelled rather than kept at zero: an empty order
        is not something the customer can act on, and the site has no state for it.
        """
        drops: list[OrderItemDrop] = []

        for order in await self._pending_orders_with(product_id):
            dropped = [item for item in order.items if item.product_id == product_id]
            if not dropped:
                continue

            for item in dropped:
                order.items.remove(item)

            self._recalculate_total(order)
            is_cancelled = not order.items
            if is_cancelled:
                # The owner's doing, even though nobody pressed "cancel": they took the
                # product out of the catalog, and the order went with it.
                order.status = OrderStatus.CANCELLED_BY_OWNER

            drops.extend(
                OrderItemDrop(
                    order_id=order.id,
                    user_id=order.user_id,
                    product_name=item.product_name,
                    total_cents=order.total_cents,
                    is_cancelled=is_cancelled,
                )
                for item in dropped
            )

        if drops:
            await self._session.flush()
        return drops

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

        result = await self._session.execute(query.offset((page - 1) * page_size).limit(page_size))
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

        if new_status is OrderStatus.CANCELLED_BY_CUSTOMER:
            raise StatusNotAssignableError

        changed = order.status != new_status
        order.status = new_status
        await self._session.flush()
        return order, changed
