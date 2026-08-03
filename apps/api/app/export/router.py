import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.db import get_session
from app.export.service import ExportService

router = APIRouter(tags=["export"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/admin/export/orders")
async def export_orders(
    cycle_id: uuid.UUID | None = Query(default=None, alias="cycleId"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    content, filename = await ExportService(session).export_orders(cycle_id)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
