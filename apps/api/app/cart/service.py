import uuid

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart.models import Cart, CartItem
from app.cart.schemas import CartItemResponse, CartResponse
from app.catalog.images import primary_image_url
from app.catalog.models import Category, Product
from app.common.limits import MAX_ITEM_QUANTITY
from app.cycles.models import OrderCycle
from app.cycles.service import CyclesService


class NoActiveCycleError(Exception):
    pass


class ProductNotFoundError(Exception):
    pass


class CartItemNotFoundError(Exception):
    pass


class CartService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._cycles = CyclesService(session)

    async def get_cart(self, user_id: uuid.UUID) -> CartResponse:
        cycle = await self._cycles.get_active_cycle()
        cart = await self._find_cart(user_id, cycle.id) if cycle is not None else None
        return await self._build_response(cycle, cart)

    async def add_item(
        self, user_id: uuid.UUID, product_id: uuid.UUID, quantity: int
    ) -> CartResponse:
        cycle = await self._require_active_cycle()

        product = await self._session.get(Product, product_id)
        if product is None or product.deleted_at is not None or not product.in_stock:
            # Out of stock is refused here rather than only hidden in the UI: the site
            # already treats such a product as unorderable, and until this check existed
            # the API happily took it — through a stale tab, or a card opened before the
            # owner unticked the box — and carried it into the order and the purchase sheet.
            raise ProductNotFoundError

        cart = await self._find_or_create_cart(user_id, cycle.id)

        await self._add_or_increment(cart, product_id, quantity)

        await self._session.flush()
        return await self._build_response(cycle, cart)

    async def _add_or_increment(self, cart: Cart, product_id: uuid.UUID, quantity: int) -> None:
        """One line per product in a cart, whether it is new or already there.

        Racy in exactly the way `_find_or_create_cart` is, and for the same reason:
        (cart_id, product_id) is UNIQUE, and a double press on "в корзину" is two parallel
        requests that both find no line and both insert one. The loser surfaced as a 500 on
        an action the customer had every right to perform — so the insert goes into a
        savepoint, and on the conflict the row the winner committed is incremented instead.
        """
        item = await self._find_item(cart, product_id)

        if item is None:
            try:
                async with self._session.begin_nested():
                    self._session.add(
                        CartItem(cart_id=cart.id, product_id=product_id, quantity=quantity)
                    )
                return
            except IntegrityError:
                item = await self._find_item(cart, product_id)
                if item is None:
                    raise

        # Clamped, not rejected: pressing "в корзину" once more on a line that is
        # already at the ceiling is not an error worth a red banner. Without this the
        # per-request limit means nothing — it would just take a few more presses.
        item.quantity = min(item.quantity + quantity, MAX_ITEM_QUANTITY)

    async def _find_item(self, cart: Cart, product_id: uuid.UUID) -> CartItem | None:
        result = await self._session.execute(
            select(CartItem).where(CartItem.cart_id == cart.id, CartItem.product_id == product_id)
        )
        return result.scalar_one_or_none()

    async def set_item_quantity(
        self, user_id: uuid.UUID, product_id: uuid.UUID, quantity: int
    ) -> CartResponse:
        cycle = await self._require_active_cycle()
        cart = await self._find_cart(user_id, cycle.id)
        item = await self._get_item(cart, product_id)
        item.quantity = quantity

        await self._session.flush()
        return await self._build_response(cycle, cart)

    async def remove_item(self, user_id: uuid.UUID, product_id: uuid.UUID) -> CartResponse:
        cycle = await self._cycles.get_active_cycle()
        cart = await self._find_cart(user_id, cycle.id) if cycle is not None else None
        item = await self._get_item(cart, product_id)

        await self._session.delete(item)
        await self._session.flush()
        return await self._build_response(cycle, cart)

    async def empty_cart(self, user_id: uuid.UUID) -> CartResponse:
        cycle = await self._cycles.get_active_cycle()
        cart = await self._find_cart(user_id, cycle.id) if cycle is not None else None
        if cart is not None:
            await self._session.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
            await self._session.flush()

        return await self._build_response(cycle, cart)

    async def _require_active_cycle(self) -> OrderCycle:
        cycle = await self._cycles.get_active_cycle()
        if cycle is None:
            raise NoActiveCycleError
        return cycle

    async def _get_item(self, cart: Cart | None, product_id: uuid.UUID) -> CartItem:
        if cart is not None:
            result = await self._session.execute(
                select(CartItem).where(
                    CartItem.cart_id == cart.id, CartItem.product_id == product_id
                )
            )
            item = result.scalar_one_or_none()
            if item is not None:
                return item
        raise CartItemNotFoundError

    async def _find_cart(self, user_id: uuid.UUID, cycle_id: uuid.UUID) -> Cart | None:
        result = await self._session.execute(
            select(Cart).where(Cart.user_id == user_id, Cart.cycle_id == cycle_id)
        )
        return result.scalar_one_or_none()

    async def _find_or_create_cart(self, user_id: uuid.UUID, cycle_id: uuid.UUID) -> Cart:
        cart = await self._find_cart(user_id, cycle_id)
        if cart is not None:
            return cart

        # Inside a savepoint, because (user_id, cycle_id) is UNIQUE and this is genuinely
        # racy: adding two products in quick succession is two parallel requests, both of
        # which find no cart and both of which insert one. The loser used to surface as a
        # 500 on an action the customer had every right to perform — so it re-reads the
        # row the winner committed instead. The savepoint is what keeps the failed insert
        # from poisoning the rest of the request's transaction.
        try:
            async with self._session.begin_nested():
                cart = Cart(user_id=user_id, cycle_id=cycle_id)
                self._session.add(cart)
        except IntegrityError:
            cart = await self._find_cart(user_id, cycle_id)
            if cart is None:
                raise
        return cart

    async def _build_response(self, cycle: OrderCycle | None, cart: Cart | None) -> CartResponse:
        if cart is None:
            return CartResponse(
                cycle_id=cycle.id if cycle is not None else None,
                cycle_deadline_at=cycle.deadline_at if cycle is not None else None,
                items=[],
                total_cents=0,
            )

        # Discontinued products — and ones the owner has taken out of stock — drop out of
        # the cart. The rows themselves are left alone (a re-import by slug revives the
        # product, and stock comes back the same way, so the line returns with it), but
        # they must not be shown or counted: adding such a product is refused everywhere
        # else, and checkout reads this same join — so a line the customer can see is
        # exactly a line they can order.
        # Category comes along in the same query (outer join — a product may have none):
        # its name is one of the labels under the line, and reading it per row would be a
        # round trip per position.
        result = await self._session.execute(
            select(CartItem, Product, Category.name)
            .join(Product, Product.id == CartItem.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(
                CartItem.cart_id == cart.id,
                Product.deleted_at.is_(None),
                Product.in_stock.is_(True),
            )
            .order_by(Product.name)
            .options(selectinload(Product.images))
        )

        items: list[CartItemResponse] = []
        total_cents = 0
        for cart_item, product, category_name in result.all():
            line_total_cents = product.price_cents * cart_item.quantity
            total_cents += line_total_cents
            items.append(
                CartItemResponse(
                    product_id=product.id,
                    product_name=product.name,
                    product_slug=product.slug,
                    product_image_url=primary_image_url(product.images),
                    product_price_cents=product.price_cents,
                    quantity=cart_item.quantity,
                    line_total_cents=line_total_cents,
                    product_brand=product.brand,
                    product_category_name=category_name,
                    product_volume_ml=product.volume_ml,
                )
            )

        return CartResponse(
            cycle_id=cycle.id if cycle is not None else None,
            cycle_deadline_at=cycle.deadline_at if cycle is not None else None,
            items=items,
            total_cents=total_cents,
        )
