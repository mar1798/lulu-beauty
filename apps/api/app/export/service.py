import io
import uuid
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote

from openpyxl import Workbook
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.cycles.models import OrderCycle
from app.orders.service import OrdersService

HEADER = [
    "Order ID",
    "Created At",
    "Customer Name",
    "Customer Phone",
    "Status",
    "Note",
    "Product",
    "Quantity",
    f"Unit Price ({settings.currency})",
    f"Line Total ({settings.currency})",
    f"Order Total ({settings.currency})",
]


@dataclass(frozen=True)
class OrderExportRow:
    order_id: uuid.UUID
    created_at: datetime
    customer_name: str
    customer_phone: str
    status: str
    note: str
    product_name: str
    quantity: int
    unit_price_cents: int
    order_total_cents: int


def build_orders_workbook(rows: list[OrderExportRow]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None  # Workbook() always creates one default worksheet.
    sheet.title = "Orders"
    sheet.append(HEADER)

    for row in rows:
        sheet.append(
            [
                str(row.order_id),
                row.created_at.isoformat(),
                row.customer_name,
                row.customer_phone,
                row.status,
                row.note,
                row.product_name,
                row.quantity,
                row.unit_price_cents / 100,
                (row.unit_price_cents * row.quantity) / 100,
                row.order_total_cents / 100,
            ]
        )

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def sanitize_filename_label(label: str) -> str:
    """ASCII-only, filename-safe rendering of a label.

    str.isalnum() is True for Cyrillic, so an earlier version let non-ASCII through into
    Content-Disposition, where Starlette encodes headers as latin-1 — any Russian cycle
    label turned the export into a 500. Non-ASCII is dropped here and the readable name is
    carried separately by the RFC 5987 filename* parameter (see content_disposition).
    """
    return "".join(
        char if (char.isascii() and char.isalnum()) or char in "-_" else "-" for char in label
    )


def readable_filename_label(label: str) -> str:
    """Keeps letters of any alphabet, drops only what is unsafe inside a filename."""
    unsafe = set('/\\:*?"<>|') | {chr(code) for code in range(32)}
    return "".join("-" if char in unsafe or char == " " else char for char in label)


def content_disposition(filename: str) -> str:
    """attachment header with an ASCII fallback plus the UTF-8 name (RFC 5987).

    Old clients read filename=; anything current prefers filename*, so the owner still
    downloads "orders-Июнь-2030.xlsx" rather than a row of dashes.
    """
    stem, _, extension = filename.rpartition(".")
    if stem:
        ascii_name = f"{sanitize_filename_label(stem)}.{extension}"
    else:
        ascii_name = sanitize_filename_label(filename)
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename, safe='')}"


class ExportService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def export_orders(self, cycle_id: uuid.UUID | None) -> tuple[bytes, str]:
        orders_service = OrdersService(self._session)
        orders = await orders_service.list_admin(cycle_id)
        users_by_id = await orders_service.load_customers(orders)

        rows = [
            OrderExportRow(
                order_id=order.id,
                created_at=order.created_at,
                customer_name=users_by_id[order.user_id].name
                if order.user_id in users_by_id
                else "—",
                customer_phone=users_by_id[order.user_id].phone
                if order.user_id in users_by_id
                else "—",
                status=order.status.value,
                note=order.note or "",
                product_name=item.product_name,
                quantity=item.quantity,
                unit_price_cents=item.product_price_cents,
                order_total_cents=order.total_cents,
            )
            for order in orders
            for item in order.items
        ]

        content = build_orders_workbook(rows)
        filename = await self._filename(cycle_id)
        return content, filename

    async def _filename(self, cycle_id: uuid.UUID | None) -> str:
        if cycle_id is None:
            return "orders-all-cycles.xlsx"

        cycle = await self._session.get(OrderCycle, cycle_id)
        label = cycle.label if cycle is not None and cycle.label else str(cycle_id)
        return f"orders-{readable_filename_label(label)}.xlsx"
