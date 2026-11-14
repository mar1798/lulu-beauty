import uuid
from collections.abc import Sequence

from sqlalchemy import ColumnElement, and_, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart.models import Cart, CartItem
from app.cart.schemas import CartItemResponse, CartResponse, GuestCartLine
from app.catalog.images import variant_image_url
from app.catalog.models import Category, Product, ProductVariant
from app.common.limits import MAX_ITEM_QUANTITY
from app.cycles.models import OrderCycle
from app.cycles.service import CyclesService


class NoActiveCycleError(Exception):
    pass


class ProductNotFoundError(Exception):
    """No live, in-stock variant at this id.

    Still named after the product because that is what the customer was looking at, and
    what `product_not_found` tells them on the site: a volume that has gone is a volume
    they cannot buy, whatever the row behind it is called.
    """


class CartItemNotFoundError(Exception):
    pass


class GuestCartCycleChangedError(Exception):
    """The guest gathered this cart in a cycle that is no longer the open one."""


def _orderable() -> ColumnElement[bool]:
    """A line a customer can see and order: live product, live variant in stock.

    Shared by the stored cart and the guest's preview, because a line the guest sees and
    the same line after signing in must not differ — the merge would quietly drop it.
    The *variant's* stock, not the product's: a product counts as in stock while any of
    its volumes is, so filtering on it would leave a sold-out 30 ml in the cart because
    the 50 ml is still available.
    """
    return and_(
        Product.deleted_at.is_(None),
        ProductVariant.deleted_at.is_(None),
        ProductVariant.in_stock.is_(True),
    )


def _guest_quantities(lines: Sequence[GuestCartLine]) -> dict[uuid.UUID, int]:
    """The guest's lines, one per variant.

    A browser cart should never hold the same volume twice, but it is the client's
    word: two lines for one variant keep the larger quantity, as the merge does.
    """
    quantities: dict[uuid.UUID, int] = {}
    for line in lines:
        quantities[line.variant_id] = max(quantities.get(line.variant_id, 0), line.quantity)
    return quantities


class CartService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._cycles = CyclesService(session)

    async def get_cart(self, user_id: uuid.UUID) -> CartResponse:
        cycle = await self._cycles.get_active_cycle()
        cart = await self._find_cart(user_id, cycle.id) if cycle is not None else None
        return await self._build_response(cycle, cart)

    async def preview(self, lines: Sequence[GuestCartLine]) -> CartResponse:
        """A guest's cart, drawn from the catalogue as it is now.

        Nothing is stored and no cycle is required: the response says whether one is
        open (`cycle_id`), and the site decides from that whether adding is allowed.
        Lines that are no longer orderable drop out the same way they do from a stored
        cart, so the guest sees exactly what the merge after sign-in would keep.
        """
        cycle = await self._cycles.get_active_cycle()
        quantities = _guest_quantities(lines)
        if not quantities:
            return self._response(cycle, [])

        result = await self._session.execute(
            select(Product, ProductVariant, Category.name)
            .select_from(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(ProductVariant.id.in_(quantities), _orderable())
            .order_by(Product.name, ProductVariant.sort_order)
            .options(selectinload(Product.images))
        )
        return self._response(
            cycle,
            [
                _line(product, variant, category_name, quantities[variant.id])
                for product, variant, category_name in result.all()
            ],
        )

    async def merge(
        self,
        user_id: uuid.UUID,
        lines: Sequence[GuestCartLine],
        cycle_id: uuid.UUID | None = None,
    ) -> CartResponse:
        """Pour the cart a guest gathered before signing in into their own.

        Each line ends up with the **larger** of the two quantities, not their sum. The
        site sends the guest cart right after sign-in and clears it on success, but a
        second tab, a retry after a lost response or a reload in Telegram's webview can
        send the same cart twice — and a sum would double it each time, silently, in a
        cart the customer then checks out. The larger quantity makes a repeat harmless,
        and the customer who wanted more of something can still press "+".

        Lines that are no longer orderable are skipped rather than refused: the guest
        cannot fix a volume that sold out while they were signing in, and one such
        line must not keep the rest out of the cart.

        A cart gathered in another cycle (`cycle_id`) is refused whole: the site moves it
        into the wishlist instead, as the scheduler does with real carts at a close. The
        site checks this too, but only once it has seen a preview — a sign-in that lands
        before the first one (the Mini App signs in at once) never gets that far.
        """
        cycle = await self._require_active_cycle()
        if cycle_id is not None and cycle_id != cycle.id:
            raise GuestCartCycleChangedError
        quantities = _guest_quantities(lines)

        result = await self._session.execute(
            select(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(ProductVariant.id.in_(quantities), _orderable())
        )
        variants = result.scalars().all()

        cart = await self._find_cart(user_id, cycle.id)
        if variants:
            cart = await self._find_or_create_cart(user_id, cycle.id)
            for variant in variants:
                await self._add_or_increment(
                    cart, variant, quantities[variant.id], keep_larger=True
                )
            await self._session.flush()

        return await self._build_response(cycle, cart)

    async def add_item(
        self, user_id: uuid.UUID, variant_id: uuid.UUID, quantity: int
    ) -> CartResponse:
        """Put one volume of a product into the cart.

        Addressed by variant throughout: the customer chose "30 мл", and the two volumes
        of one serum are two lines with two prices and two quantities.
        """
        cycle = await self._require_active_cycle()

        variant = await self._live_variant(variant_id)
        if variant is None:
            # Out of stock is refused here rather than only hidden in the UI: the site
            # already treats such a volume as unorderable, and until this check existed
            # the API happily took it — through a stale tab, or a card opened before the
            # owner unticked the box — and carried it into the order and the purchase sheet.
            raise ProductNotFoundError

        cart = await self._find_or_create_cart(user_id, cycle.id)

        await self._add_or_increment(cart, variant, quantity)

        await self._session.flush()
        return await self._build_response(cycle, cart)

    async def _live_variant(self, variant_id: uuid.UUID) -> ProductVariant | None:
        """The variant, if it is one a customer may actually order right now.

        Both rows have to be checked: the variant carries its own stock, and the product
        behind it may have been withdrawn from the catalogue since the page was opened.
        """
        result = await self._session.execute(
            select(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id == variant_id,
                ProductVariant.deleted_at.is_(None),
                ProductVariant.in_stock.is_(True),
                Product.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def _add_or_increment(
        self, cart: Cart, variant: ProductVariant, quantity: int, *, keep_larger: bool = False
    ) -> None:
        """One line per variant in a cart, whether it is new or already there.

        Racy in exactly the way `_find_or_create_cart` is, and for the same reason:
        (cart_id, variant_id) is UNIQUE, and a double press on "в корзину" is two parallel
        requests that both find no line and both insert one. The loser surfaced as a 500 on
        an action the customer had every right to perform — so the insert goes into a
        savepoint, and on the conflict the row the winner committed is incremented instead.

        `keep_larger` is the merge of a guest cart: an existing line is raised to the
        guest's quantity rather than added to (see `merge`).
        """
        item = await self._find_item(cart, variant.id)

        if item is None:
            try:
                async with self._session.begin_nested():
                    self._session.add(
                        CartItem(
                            cart_id=cart.id,
                            product_id=variant.product_id,
                            variant_id=variant.id,
                            quantity=quantity,
                        )
                    )
                return
            except IntegrityError:
                item = await self._find_item(cart, variant.id)
                if item is None:
                    raise

        # Clamped, not rejected: pressing "в корзину" once more on a line that is
        # already at the ceiling is not an error worth a red banner. Without this the
        # per-request limit means nothing — it would just take a few more presses.
        combined = max(item.quantity, quantity) if keep_larger else item.quantity + quantity
        item.quantity = min(combined, MAX_ITEM_QUANTITY)

    async def _find_item(self, cart: Cart, variant_id: uuid.UUID) -> CartItem | None:
        result = await self._session.execute(
            select(CartItem).where(CartItem.cart_id == cart.id, CartItem.variant_id == variant_id)
        )
        return result.scalar_one_or_none()

    async def set_item_quantity(
        self, user_id: uuid.UUID, variant_id: uuid.UUID, quantity: int
    ) -> CartResponse:
        cycle = await self._require_active_cycle()
        cart = await self._find_cart(user_id, cycle.id)
        item = await self._get_item(cart, variant_id)
        item.quantity = quantity

        await self._session.flush()
        return await self._build_response(cycle, cart)

    async def remove_item(self, user_id: uuid.UUID, variant_id: uuid.UUID) -> CartResponse:
        cycle = await self._cycles.get_active_cycle()
        cart = await self._find_cart(user_id, cycle.id) if cycle is not None else None
        item = await self._get_item(cart, variant_id)

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

    async def _get_item(self, cart: Cart | None, variant_id: uuid.UUID) -> CartItem:
        if cart is not None:
            item = await self._find_item(cart, variant_id)
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
            return self._response(cycle, [])

        # Discontinued products and volumes — and ones the owner has taken out of stock —
        # drop out of the cart (`_orderable`). The rows themselves are left alone (a
        # re-import by slug revives the product, and stock comes back the same way, so the
        # line returns), but they must not be shown or counted: adding such a product is
        # refused everywhere else, and checkout reads this same join — so a line the
        # customer can see is exactly a line they can order.
        # Category comes along in the same query (outer join — a product may have none):
        # its name is one of the labels under the line, and reading it per row would be a
        # round trip per position.
        result = await self._session.execute(
            select(CartItem, Product, ProductVariant, Category.name)
            .join(Product, Product.id == CartItem.product_id)
            .join(ProductVariant, ProductVariant.id == CartItem.variant_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(CartItem.cart_id == cart.id, _orderable())
            # Volumes of one product keep the order the owner gave them, so the cart does
            # not reshuffle two lines that share a name.
            .order_by(Product.name, ProductVariant.sort_order)
            .options(selectinload(Product.images))
        )

        return self._response(
            cycle,
            [
                _line(product, variant, category_name, cart_item.quantity)
                for cart_item, product, variant, category_name in result.all()
            ],
        )

    @staticmethod
    def _response(cycle: OrderCycle | None, items: list[CartItemResponse]) -> CartResponse:
        return CartResponse(
            cycle_id=cycle.id if cycle is not None else None,
            cycle_deadline_at=cycle.deadline_at if cycle is not None else None,
            items=items,
            total_cents=sum(item.line_total_cents for item in items),
        )


def _line(
    product: Product, variant: ProductVariant, category_name: str | None, quantity: int
) -> CartItemResponse:
    return CartItemResponse(
        product_id=product.id,
        variant_id=variant.id,
        product_name=product.name,
        product_slug=product.slug,
        # The photo of the shade in the cart, not the product's first one: three
        # lipsticks in one cart are three different colours.
        product_image_url=variant_image_url(product.images, variant.volume_ml, variant.shade),
        product_price_cents=variant.price_cents,
        quantity=quantity,
        line_total_cents=variant.price_cents * quantity,
        product_brand=product.brand,
        product_category_name=category_name,
        product_volume_ml=variant.volume_ml,
        product_shade=variant.shade,
    )
