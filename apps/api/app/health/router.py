import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db import engine

logger = logging.getLogger("app.health")

router = APIRouter()


@router.get("/health")
async def check() -> JSONResponse:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - reported as a health-check failure, not raised
        # Logged, not returned: the endpoint is unauthenticated, and a driver's connection
        # error spells out the database host, port and user it failed to reach. Whoever
        # needs the detail has the logs; whoever is probing the address does not.
        logger.exception("Health check failed: database unreachable")
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "info": {"database": {"status": "down", "message": "database unreachable"}},
            },
        )

    return JSONResponse(
        status_code=200,
        content={"status": "ok", "info": {"database": {"status": "up"}}},
    )
