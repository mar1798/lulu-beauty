import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import Cart, CartItem
from app.cart.schemas import CartItemResponse, CartResponse
from app.catalog.models import Product
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
        if product is None or product.deleted_at is not None:
            raise ProductNotFoundError

        cart = await self._find_or_create_cart(user_id, cycle.id)

        result = await self._session.execute(
            select(CartItem).where(CartItem.cart_id == cart.id, CartItem.product_id == product_id)
        )
        item = result.scalar_one_or_none()
        if item is None:
            self._session.add(CartItem(cart_id=cart.id, product_id=product_id, quantity=quantity))
        else:
            item.quantity += quantity

        await self._session.flush()
        return await self._build_response(cycle, cart)

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
        if cart is None:
            cart = Cart(user_id=user_id, cycle_id=cycle_id)
            self._session.add(cart)
            await self._session.flush()
        return cart

    async def _build_response(self, cycle: OrderCycle | None, cart: Cart | None) -> CartResponse:
        if cart is None:
            return CartResponse(
                cycle_id=cycle.id if cycle is not None else None,
                cycle_deadline_at=cycle.deadline_at if cycle is not None else None,
                items=[],
                total_cents=0,
            )

        result = await self._session.execute(
            select(CartItem, Product)
            .join(Product, Product.id == CartItem.product_id)
            .where(CartItem.cart_id == cart.id)
            .order_by(Product.name)
        )

        items: list[CartItemResponse] = []
        total_cents = 0
        for cart_item, product in result.all():
            line_total_cents = product.price_cents * cart_item.quantity
            total_cents += line_total_cents
            items.append(
                CartItemResponse(
                    product_id=product.id,
                    product_name=product.name,
                    product_price_cents=product.price_cents,
                    quantity=cart_item.quantity,
                    line_total_cents=line_total_cents,
                )
            )

        return CartResponse(
            cycle_id=cycle.id if cycle is not None else None,
            cycle_deadline_at=cycle.deadline_at if cycle is not None else None,
            items=items,
            total_cents=total_cents,
        )
