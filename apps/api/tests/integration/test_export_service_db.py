from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.cart.service import CartService
from app.export.service import ExportService
from app.orders.models import OrderStatus
from app.orders.service import OrdersService
from tests.integration.factories import make_cycle, make_product, make_user


async def _place_order(session: AsyncSession, user_id, product_id, quantity: int):  # type: ignore[no-untyped-def]
    await CartService(session).add_item(user_id, product_id, quantity)
    return await OrdersService(session).checkout(user_id, note="комментарий")


async def test_export_rows_flatten_orders_into_one_line_per_item(
    db_session: AsyncSession,
) -> None:
    """Строка выгрузки — это позиция заявки, с данными заявки и покупателя рядом."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    first = await make_product(db_session, name="Крем", slug="krem", price_cents=15000)
    second = await make_product(db_session, name="Тоник", slug="tonik", price_cents=5000)

    order = await _place_order(db_session, user.id, first.id, 2)
    await OrdersService(db_session).add_item(user.id, order.id, second.id, 3)

    rows = await ExportService(db_session)._export_rows(None)

    assert len(rows) == 2
    assert {row.product_name for row in rows} == {"Крем", "Тоник"}
    krem = next(row for row in rows if row.product_name == "Крем")
    assert krem.quantity == 2
    assert krem.unit_price_cents == 15000
    assert krem.order_total_cents == 2 * 15000 + 3 * 5000
    assert krem.customer_phone == user.phone
    assert krem.status == OrderStatus.PENDING.value
    assert krem.note == "комментарий"


async def test_export_rows_are_newest_first_and_can_be_scoped_to_a_cycle(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session)

    old_cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    older_order = await _place_order(db_session, user.id, product.id, 1)
    older_order.created_at = datetime.now(UTC) - timedelta(days=2)

    # Новый сбор перекрывает старый: get_active_cycle берёт ближайший дедлайн.
    old_cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    new_cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=1))
    newer_order = await _place_order(db_session, user.id, product.id, 1)
    await db_session.flush()

    everything = await ExportService(db_session)._export_rows(None)
    assert [row.order_id for row in everything] == [newer_order.id, older_order.id]

    scoped = await ExportService(db_session)._export_rows(new_cycle.id)
    assert [row.order_id for row in scoped] == [newer_order.id]


async def test_deleting_a_customer_takes_their_orders_out_of_the_export(
    db_session: AsyncSession,
) -> None:
    """Осиротевших заявок не бывает: orders.user_id каскадный.

    Именно поэтому LEFT JOIN на users в выгрузке — подстраховка, а не рабочая ветка:
    прочерк вместо имени взять неоткуда, строка уходит вместе с покупателем. Тест
    закрепляет каскад — если он когда-нибудь станет SET NULL, внутренний JOIN начнёт
    молча терять заявки из листа закупки, и упасть должно здесь.
    """
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await _place_order(db_session, user.id, product.id, 1)
    assert len(await ExportService(db_session)._export_rows(None)) == 1

    await db_session.execute(delete(User).where(User.id == user.id))

    assert await ExportService(db_session)._export_rows(None) == []
