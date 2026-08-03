import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.config import settings
from app.health.router import router as health_router


def create_app() -> FastAPI:
    # Root logger defaults to WARNING with no handler, which would silently drop the
    # console/log OTP delivery stand-in (app.auth.otp) used until the Telegram bot is wired up.
    logging.basicConfig(level=logging.INFO)

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.cors_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(auth_router)
    return app


app = create_app()
