import io
import uuid
from dataclasses import dataclass
from datetime import datetime

from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
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
    return "".join(char if char.isalnum() or char in "-_" else "-" for char in label)


class ExportService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def export_orders(self, cycle_id: uuid.UUID | None) -> tuple[bytes, str]:
        orders = await OrdersService(self._session).list_admin(cycle_id)

        user_ids = {order.user_id for order in orders}
        users_by_id: dict[uuid.UUID, User] = {}
        if user_ids:
            result = await self._session.execute(select(User).where(User.id.in_(user_ids)))
            users_by_id = {user.id: user for user in result.scalars().all()}

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
        return f"orders-{sanitize_filename_label(label)}.xlsx"
