from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# `pool_pre_ping` because the connections in this pool outlive the things at the other
# end of them: a Postgres restart, a container redeploy or a NAT dropping an idle
# connection leaves the pool holding sockets that look open and fail on first use — and
# there is no global `SQLAlchemyError` handler here, so each one of those is a 500 served
# to a customer. `pool_recycle` retires a connection before any middlebox decides to.
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
)
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession]:
    async with async_session() as session:
        yield session
