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
    # The money columns are optional because the same sheet gets forwarded to the supplier,
    # who has no business seeing the shop's own prices. Default stays True — the owner's own
    # purchase list is the common case, and an old client that omits the param keeps it.
    include_prices: bool = Query(default=True, alias="includePrices"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    content, filename = await ExportService(session).export_orders(
        cycle_id, order_status, include_prices=include_prices
    )
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": content_disposition(filename)},
    )
