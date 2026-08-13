import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.catalog.models import Product, ProductImage
from app.cycles.models import CycleStatus, OrderCycle


async def make_user(
    session: AsyncSession,
    *,
    phone: str | None = None,
    role: Role = Role.CUSTOMER,
    telegram_chat_id: int | None = None,
) -> User:
    user = User(
        phone=phone or f"+1{uuid.uuid4().int % 10**10:010d}",
        name="Test User",
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
    deleted_at: datetime | None = None,
) -> Product:
    product = Product(
        name=name,
        slug=slug or f"test-product-{uuid.uuid4().hex[:12]}",
        price_cents=price_cents,
        in_stock=in_stock,
        deleted_at=deleted_at,
    )
    session.add(product)
    await session.flush()
    return product


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
