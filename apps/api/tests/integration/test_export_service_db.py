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


async def test_export_rows_sum_one_product_across_orders(db_session: AsyncSession) -> None:
    """Строка выгрузки — это товар, а не позиция заявки: количество складывается."""
    first_user = await make_user(db_session)
    second_user = await make_user(db_session)
    await make_cycle(db_session)
    krem = await make_product(
        db_session, name="Крем", slug="krem", price_cents=15000, brand="Lulu"
    )
    tonik = await make_product(db_session, name="Тоник", slug="tonik", price_cents=5000)

    order = await _place_order(db_session, first_user.id, krem.id, 2)
    await OrdersService(db_session).add_item(first_user.id, order.id, tonik.id, 3)
    await _place_order(db_session, second_user.id, krem.id, 4)

    rows = await ExportService(db_session)._export_rows(None)

    assert len(rows) == 2
    by_name = {row.product_name: row for row in rows}
    assert by_name["Крем"].quantity == 6
    assert by_name["Крем"].brand == "Lulu"
    assert by_name["Крем"].unit_price_cents == 15000
    assert by_name["Крем"].total_cents == 6 * 15000
    # Бренд не проставлен — в лист уходит прочерк, а не пустая ячейка.
    assert by_name["Тоник"].brand == "—"
    assert by_name["Тоник"].quantity == 3


async def test_export_rows_split_one_product_by_its_snapshotted_price(
    db_session: AsyncSession,
) -> None:
    """Цена в позиции — снимок: заявки по разным ценам остаются разными строками."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, name="Крем", slug="krem", price_cents=15000)

    await _place_order(db_session, user.id, product.id, 2)
    product.price_cents = 20000
    await db_session.flush()
    await _place_order(db_session, user.id, product.id, 1)

    rows = await ExportService(db_session)._export_rows(None)

    assert {(row.unit_price_cents, row.quantity) for row in rows} == {(15000, 2), (20000, 1)}


async def test_export_rows_can_be_scoped_to_a_cycle_and_a_status(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session, price_cents=1000)

    old_cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    await _place_order(db_session, user.id, product.id, 5)

    # Новый сбор перекрывает старый: get_active_cycle берёт ближайший дедлайн.
    old_cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    new_cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=1))
    newer_order = await _place_order(db_session, user.id, product.id, 2)
    await db_session.flush()

    service = ExportService(db_session)

    everything = await service._export_rows(None)
    assert [row.quantity for row in everything] == [7]

    scoped = await service._export_rows(new_cycle.id)
    assert [row.quantity for row in scoped] == [2]

    # Отменённая заявка не должна попадать в лист закупки.
    newer_order.status = OrderStatus.CANCELLED_BY_CUSTOMER
    await db_session.flush()

    pending = await service._export_rows(None, OrderStatus.PENDING)
    assert [row.quantity for row in pending] == [5]
    cancelled = await service._export_rows(None, OrderStatus.CANCELLED_BY_CUSTOMER)
    assert [row.quantity for row in cancelled] == [2]


async def test_deleting_a_customer_takes_their_orders_out_of_the_export(
    db_session: AsyncSession,
) -> None:
    """Осиротевших заявок не бывает: orders.user_id каскадный.

    Покупателя в листе закупки уже нет, но заявки он всё ещё уносит с собой — если
    каскад когда-нибудь станет SET NULL, строки останутся висеть в закупке без заявки,
    и упасть должно здесь.
    """
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await _place_order(db_session, user.id, product.id, 1)
    assert len(await ExportService(db_session)._export_rows(None)) == 1

    await db_session.execute(delete(User).where(User.id == user.id))

    assert await ExportService(db_session)._export_rows(None) == []
