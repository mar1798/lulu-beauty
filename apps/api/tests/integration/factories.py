import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.catalog.models import Category, Product, ProductImage, ProductVariant
from app.catalog.service import ProductService
from app.cycles.models import CycleStatus, OrderCycle

# Sentinel for "the test did not name a volume". None is a real volume (a product with
# nothing to measure), so it cannot double as the default.
_ANY_VOLUME: int | None = -1


async def make_user(
    session: AsyncSession,
    *,
    phone: str | None = None,
    name: str = "Test User",
    role: Role = Role.CUSTOMER,
    telegram_chat_id: int | None = None,
) -> User:
    user = User(
        phone=phone or f"+1{uuid.uuid4().int % 10**10:010d}",
        name=name,
        role=role,
        telegram_chat_id=telegram_chat_id,
    )
    session.add(user)
    await session.flush()
    return user


async def make_product(
    session: AsyncSession,
    *,
    name: str = "Test Product",
    price_cents: int = 1000,
    in_stock: bool = True,
    slug: str | None = None,
    brand: str | None = None,
    volume_ml: int | None = None,
    category_id: uuid.UUID | None = None,
    deleted_at: datetime | None = None,
    description: str | None = None,
    variants: list[tuple[int | None, int, bool]] | None = None,
) -> Product:
    """A product and the volumes it is sold in.

    `variants` is a list of `(volume_ml, price_cents, in_stock)` for a product sold in
    several; left out, the product gets the single variant its own arguments describe.
    """
    # Every product has at least one variant — that is an invariant of the catalogue, not
    # a detail of the admin form, so the factory keeps it whether or not a test cares.
    # `variants` given explicitly is a product sold in several volumes; the product's own
    # price/volume/stock columns are then derived from them, exactly as in the service.
    product = Product(
        name=name,
        slug=slug or f"test-product-{uuid.uuid4().hex[:12]}",
        brand=brand,
        description=description,
        volume_ml=volume_ml,
        category_id=category_id,
        price_cents=price_cents,
        in_stock=in_stock,
        deleted_at=deleted_at,
        variants=(
            [
                ProductVariant(
                    volume_ml=spec_volume,
                    price_cents=spec_price,
                    in_stock=spec_stock,
                    sort_order=sort_order,
                )
                for sort_order, (spec_volume, spec_price, spec_stock) in enumerate(variants)
            ]
            if variants is not None
            else [
                ProductVariant(
                    volume_ml=volume_ml,
                    price_cents=price_cents,
                    in_stock=in_stock,
                    sort_order=0,
                )
            ]
        ),
    )
    if variants is not None:
        ProductService.refresh_display_fields(product)
    session.add(product)
    await session.flush()
    return product


async def make_category(
    session: AsyncSession,
    *,
    name: str = "Test Category",
    slug: str | None = None,
    sort_order: int = 0,
) -> Category:
    category = Category(
        name=name,
        slug=slug or f"test-category-{uuid.uuid4().hex[:12]}",
        sort_order=sort_order,
    )
    session.add(category)
    await session.flush()
    return category


async def make_product_image(
    session: AsyncSession,
    product: Product,
    *,
    url: str = "http://localhost:3001/files/image.jpg",
    sort_order: int = 0,
    is_primary: bool = False,
) -> ProductImage:
    image = ProductImage(
        product_id=product.id,
        url=url,
        alt=None,
        sort_order=sort_order,
        is_primary=is_primary,
    )
    session.add(image)
    await session.flush()
    return image


async def make_cycle(
    session: AsyncSession,
    *,
    deadline_at: datetime | None = None,
    label: str | None = "Test Cycle",
    status: CycleStatus = CycleStatus.UPCOMING,
) -> OrderCycle:
    cycle = OrderCycle(
        deadline_at=deadline_at or (datetime.now(UTC) + timedelta(days=1)),
        label=label,
        status=status,
    )
    session.add(cycle)
    await session.flush()
    return cycle


def variant_id(product: Product, volume_ml: int | None = _ANY_VOLUME) -> uuid.UUID:
    """The id of the volume a test means — the only one, unless it names which.

    Carts and orders are addressed by variant now, and a test that says nothing about
    volumes means the single one its product has. Asking for a product that has several
    without naming one is an error in the test, not a coin flip.
    """
    live = product.live_variants
    if volume_ml is not _ANY_VOLUME:
        return next(variant.id for variant in live if variant.volume_ml == volume_ml)
    if len(live) != 1:
        raise AssertionError(
            f"{product.slug} is sold in {len(live)} volumes — say which one this test means"
        )
    return live[0].id
