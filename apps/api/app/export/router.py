import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.db import get_session
from app.export.service import ExportService, content_disposition
from app.orders.models import OrderStatus

router = APIRouter(tags=["export"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/admin/export/orders")
async def export_orders(
    cycle_id: uuid.UUID | None = Query(default=None, alias="cycleId"),
    # Same alias as GET /admin/orders: the sheet is the owner's shopping list, so it has to
    # be narrowable to exactly what the admin table above the button is showing — a purchase
    # list that silently counts the cancelled orders in too would be a wrong order.
    order_status: OrderStatus | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    content, filename = await ExportService(session).export_orders(cycle_id, order_status)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": content_disposition(filename)},
    )
