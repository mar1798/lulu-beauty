import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.auth.security import hash_password
from app.catalog.models import Product
from app.cycles.models import CycleStatus, OrderCycle


async def make_user(
    session: AsyncSession,
    *,
    phone: str | None = None,
    role: Role = Role.CUSTOMER,
    phone_verified: bool = True,
) -> User:
    user = User(
        phone=phone or f"+1{uuid.uuid4().int % 10**10:010d}",
        name="Test User",
        password_hash=hash_password("irrelevant-password"),
        role=role,
        phone_verified=phone_verified,
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
) -> Product:
    product = Product(
        name=name,
        slug=f"test-product-{uuid.uuid4().hex[:12]}",
        price_cents=price_cents,
        in_stock=in_stock,
    )
    session.add(product)
    await session.flush()
    return product


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
