import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import scheduler
from app.auth.router import router as auth_router
from app.cart.router import router as cart_router
from app.catalog.router import router as catalog_router
from app.common.rate_limit import RateLimitMiddleware
from app.config import settings
from app.cycles.router import router as cycles_router
from app.export.router import router as export_router
from app.health.router import router as health_router
from app.orders.router import router as orders_router
from app.telegram import bot as telegram_bot
from app.telegram.webhook import router as telegram_webhook_router
from app.users.router import router as users_router
from app.wishlist.router import router as wishlist_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Awaited now, unlike the old fire-and-forget start_polling(): in webhook mode this
    # registers the address with Telegram, and doing that after the server has started
    # answering would drop whatever arrived in between.
    await telegram_bot.start()
    scheduler.start()
    yield
    scheduler.stop()
    await telegram_bot.stop()


def create_app() -> FastAPI:
    # Root logger defaults to WARNING with no handler, which would silently drop the
    # console/log OTP delivery fallback (app.telegram) used when a user hasn't linked
    # Telegram yet, or when TELEGRAM_BOT_TOKEN isn't configured.
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(lifespan=lifespan)
    # Added first, so it runs last: Starlette applies middleware in reverse, and the limit
    # has to be inside CORS — a 429 that arrives without the CORS headers reads in the
    # browser as a network failure rather than as the refusal it is.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.cors_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(catalog_router)
    app.include_router(cycles_router)
    app.include_router(cart_router)
    app.include_router(wishlist_router)
    app.include_router(orders_router)
    app.include_router(export_router)
    # Mounted whether or not the webhook mode is on — it answers 404 while it is off, so
    # the app has one shape in both configurations (see app/telegram/webhook.py).
    app.include_router(telegram_webhook_router)
    app.mount("/files", StaticFiles(directory=settings.upload_dir, check_dir=False), name="files")
    return app


app = create_app()
