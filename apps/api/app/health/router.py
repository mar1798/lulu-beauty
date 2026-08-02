from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db import engine

router = APIRouter()


@router.get("/health")
async def check() -> JSONResponse:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as error:  # noqa: BLE001 - reported as a health-check failure, not raised
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "info": {"database": {"status": "down", "message": str(error)}},
            },
        )

    return JSONResponse(
        status_code=200,
        content={"status": "ok", "info": {"database": {"status": "up"}}},
    )
