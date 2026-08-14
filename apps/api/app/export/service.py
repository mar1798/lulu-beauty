import io
import uuid
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote

import anyio.to_thread
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.config import settings
from app.cycles.models import OrderCycle
from app.orders.models import Order, OrderItem

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
    """Serializes the rows to xlsx bytes. Blocking CPU — call it off the event loop.

    write_only, because the default Workbook keeps every cell as a Python object until
    save() and then walks the lot: on a full-catalogue export (100k lines) that was ~7.6s
    of the request, against ~2.3s of actual SQL. In write-only mode openpyxl streams each
    row to the underlying archive as it is appended, which is both far faster and flat in
    memory. The trade-off is that the sheet cannot be read back or re-ordered afterwards,
    which no caller here does.
    """
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet(title="Orders")
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
        rows = await self._export_rows(cycle_id)

        # In a worker thread: everything above is I/O the event loop can interleave, but
        # the xlsx serialization is pure CPU, and on a full export it ran long enough
        # (seconds) to stall every other request in the process — the API is single-
        # threaded, so a blocking call here is downtime for the whole shop, not just for
        # the owner waiting on their download.
        content = await anyio.to_thread.run_sync(build_orders_workbook, rows)
        filename = await self._filename(cycle_id)
        return content, filename

    async def _export_rows(self, cycle_id: uuid.UUID | None) -> list[OrderExportRow]:
        """One flat join, read as plain rows rather than through the ORM.

        The sheet is one line per order item with the order and the customer repeated
        across it — which is what this join returns directly. Going via the ORM meant
        loading every Order, its OrderItems and its User as mapped objects, complete with
        identity map and relationship bookkeeping, only to flatten them again here: on a
        full export that was seconds of hydration for objects nothing ever navigated.

        A LEFT JOIN on users, so an order whose customer somehow no longer exists is still
        exported (with the same "—" the admin listing shows) instead of vanishing from the
        owner's shopping list.
        """
        query = (
            select(
                Order.id,
                Order.created_at,
                User.name,
                User.phone,
                Order.status,
                Order.note,
                OrderItem.product_name,
                OrderItem.quantity,
                OrderItem.product_price_cents,
                Order.total_cents,
            )
            .join(OrderItem, OrderItem.order_id == Order.id)
            .outerjoin(User, User.id == Order.user_id)
            .order_by(Order.created_at.desc())
        )
        if cycle_id is not None:
            query = query.where(Order.cycle_id == cycle_id)

        result = await self._session.execute(query)
        return [
            OrderExportRow(
                order_id=order_id,
                created_at=created_at,
                customer_name=name if name is not None else "—",
                customer_phone=phone if phone is not None else "—",
                status=status.value,
                note=note or "",
                product_name=product_name,
                quantity=quantity,
                unit_price_cents=unit_price_cents,
                order_total_cents=order_total_cents,
            )
            for (
                order_id,
                created_at,
                name,
                phone,
                status,
                note,
                product_name,
                quantity,
                unit_price_cents,
                order_total_cents,
            ) in result.all()
        ]

    async def _filename(self, cycle_id: uuid.UUID | None) -> str:
        if cycle_id is None:
            return "orders-all-cycles.xlsx"

        cycle = await self._session.get(OrderCycle, cycle_id)
        label = cycle.label if cycle is not None and cycle.label else str(cycle_id)
        return f"orders-{readable_filename_label(label)}.xlsx"
