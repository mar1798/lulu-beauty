import uuid
from enum import StrEnum

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import token_service
from app.auth.dependencies import CurrentUser, load_admin, require_admin
from app.common.schemas import CamelModel
from app.db import get_session
from app.export.products import CatalogExportService
from app.export.service import ExportService, content_disposition
from app.orders.models import OrderStatus

router = APIRouter(tags=["export"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# The file is the shop's own data, and the download link below works without a session:
# neither may linger in a shared cache or the browser's disk cache.
NO_STORE = "no-store"


class ExportKind(StrEnum):
    ORDERS = "orders"
    PRODUCTS = "products"


class ExportLinkRequest(CamelModel):
    kind: ExportKind
    # The same filters as GET /admin/export/orders; ignored for the catalog.
    cycle_id: uuid.UUID | None = None
    status: OrderStatus | None = None
    include_prices: bool = True


class ExportLinkResponse(CamelModel):
    token: str


def _xlsx(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": content_disposition(filename),
            "Cache-Control": NO_STORE,
        },
    )


async def _orders_file(
    session: AsyncSession,
    cycle_id: uuid.UUID | None,
    order_status: OrderStatus | None,
    include_prices: bool,
) -> Response:
    content, filename = await ExportService(session).export_orders(
        cycle_id, order_status, include_prices=include_prices
    )
    return _xlsx(content, filename)


async def _products_file(session: AsyncSession) -> Response:
    content, filename = await CatalogExportService(session).export_products()
    return _xlsx(content, filename)


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
    return await _orders_file(session, cycle_id, order_status, include_prices)


@router.get("/admin/export/products")
async def export_products(
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    return await _products_file(session)


@router.post("/admin/export/links", response_model=ExportLinkResponse)
async def create_export_link(
    body: ExportLinkRequest,
    admin: CurrentUser = Depends(require_admin),
) -> ExportLinkResponse:
    """A two-minute link to one export, for a client that cannot save a fetched blob.

    Telegram's in-app browser and Mini App ignore `<a download>` on a blob URL, so the
    owner exporting from their phone got neither a file nor an error. There the site asks
    for this link and hands it to Telegram (`WebApp.downloadFile`), which downloads it
    itself — without the site's cookies, hence the token in the path.
    """
    params: dict[str, object] = {}
    if body.kind is ExportKind.ORDERS:
        params = {
            "cycleId": None if body.cycle_id is None else str(body.cycle_id),
            "status": None if body.status is None else body.status.value,
            "includePrices": body.include_prices,
        }
    token = token_service.create_download_token(admin.id, body.kind.value, params)
    return ExportLinkResponse(token=token)


@router.get("/export/download/{token}")
async def download_export(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """The file behind a link from `create_export_link`. No session: the token is the auth.

    The role is read again here rather than trusted from the moment the link was made —
    an account demoted or erased in those two minutes gets nothing.
    """
    try:
        payload = token_service.decode_download_token(token)
        user_id = uuid.UUID(payload.sub)
        kind = ExportKind(payload.export)
    except (token_service.InvalidTokenError, ValueError) as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "export_link_invalid") from error

    await load_admin(user_id, session)

    if kind is ExportKind.PRODUCTS:
        return await _products_file(session)

    params = payload.params
    try:
        cycle_id = None if params.get("cycleId") is None else uuid.UUID(str(params["cycleId"]))
        order_status = None if params.get("status") is None else OrderStatus(params["status"])
    except ValueError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "export_link_invalid") from error
    include_prices = params.get("includePrices") is not False
    return await _orders_file(session, cycle_id, order_status, include_prices)
