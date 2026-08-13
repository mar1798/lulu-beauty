from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import CartItem
from app.cart.service import CartService
from app.cycles.models import CycleStatus
from app.cycles.scheduler_service import CartRescue, CycleSchedulerService
from app.orders.service import OrdersService
from app.telegram.notify import notify_carts_rescued
from app.telegram.service import BroadcastResult
from app.wishlist.models import WishlistItem
from app.wishlist.service import WishlistService
from tests.integration.factories import make_cycle, make_product, make_user


def _patch_send_reminder(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    send_reminder = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "app.cycles.scheduler_service.notifications_service.send_reminder", send_reminder
    )
    return send_reminder


async def test_sweep_reminders_notifies_once_per_stage_and_is_idempotent(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=20))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)

    send_reminder = _patch_send_reminder(monkeypatch)
    service = CycleSchedulerService(db_session)

    first_count = await service.sweep_reminders()
    await db_session.refresh(cycle)
    assert first_count == 1
    assert cycle.reminder_sent_at is not None
    assert cycle.final_reminder_sent_at is None  # три часа ещё не наступили
    assert send_reminder.await_args.kwargs["last_chance"] is False

    assert await service.sweep_reminders() == 0
    send_reminder.assert_awaited_once()  # still just once: reminder_sent_at gates re-entry

    # Дедлайн подошёл вплотную — теперь очередь второго, последнего напоминания.
    cycle.deadline_at = datetime.now(UTC) + timedelta(hours=2)
    await db_session.flush()

    assert await service.sweep_reminders() == 1
    await db_session.refresh(cycle)
    assert cycle.final_reminder_sent_at is not None
    assert send_reminder.await_args.kwargs["last_chance"] is True

    assert await service.sweep_reminders() == 0
    assert send_reminder.await_count == 2


async def test_sweep_reminders_sends_only_the_last_chance_to_a_late_cycle(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Сбор, открытый за час до собственного дедлайна, попадает в оба окна сразу.
    Предупреждение «за сутки», тут же опровергнутое «последним шансом», — не два
    уведомления, а одно испорченное."""
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)

    send_reminder = _patch_send_reminder(monkeypatch)

    count = await CycleSchedulerService(db_session).sweep_reminders()

    assert count == 1
    send_reminder.assert_awaited_once()
    assert send_reminder.await_args.kwargs["last_chance"] is True
    await db_session.refresh(cycle)
    # Обогнанная стадия помечена отправленной, иначе следующий тик пришлёт её вдогонку.
    assert cycle.reminder_sent_at is not None
    assert cycle.final_reminder_sent_at is not None


async def test_sweep_reminders_skips_users_who_already_checked_out(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    await OrdersService(db_session).checkout(user.id, note=None)

    send_reminder = _patch_send_reminder(monkeypatch)

    count = await CycleSchedulerService(db_session).sweep_reminders()

    assert count == 0
    send_reminder.assert_not_awaited()


async def test_sweep_deadlines_closes_cycle_and_clears_abandoned_carts_only(
    db_session: AsyncSession,
) -> None:
    abandoned_user = await make_user(db_session)
    checked_out_user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    product = await make_product(db_session)

    await CartService(db_session).add_item(abandoned_user.id, product.id, 1)
    await CartService(db_session).add_item(checked_out_user.id, product.id, 1)
    order = await OrdersService(db_session).checkout(checked_out_user.id, note=None)

    # Simulate the deadline having passed (rather than sleeping in the test).
    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert len(closures) == 1
    await db_session.refresh(cycle)
    assert cycle.status == CycleStatus.CLOSED
    assert cycle.closed_at is not None

    remaining_items = (await db_session.execute(select(CartItem))).scalars().all()
    assert remaining_items == []  # abandoned cart cleared

    # The already-checked-out order is untouched.
    reloaded_order = await OrdersService(db_session).get_for_user(checked_out_user.id, order.id)
    assert len(reloaded_order.items) == 1


async def test_sweep_deadlines_moves_abandoned_carts_into_wishlists(
    db_session: AsyncSession,
) -> None:
    """Корзина не переживает свой сбор, но выбор товаров — работа покупателя, и
    выбрасывать её значит заставить его собирать корзину заново по памяти."""
    abandoned_user = await make_user(db_session)
    checked_out_user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    cream = await make_product(db_session, name="Крем")
    serum = await make_product(db_session, name="Сыворотка")

    cart = CartService(db_session)
    await cart.add_item(abandoned_user.id, cream.id, 2)
    await cart.add_item(abandoned_user.id, serum.id, 1)
    await cart.add_item(checked_out_user.id, cream.id, 1)
    await OrdersService(db_session).checkout(checked_out_user.id, note=None)

    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert [(r.saved, r.dropped) for r in closures[0].rescued_carts] == [(2, 0)]
    saved = await WishlistService(db_session).get_wishlist(abandoned_user.id)
    assert {item.product.name for item in saved.items} == {"Крем", "Сыворотка"}
    # Оформивший заявку ничего не терял — и в избранное ему ничего не клали.
    assert (await WishlistService(db_session).get_wishlist(checked_out_user.id)).items == []
    assert (await db_session.execute(select(CartItem))).scalars().all() == []


async def test_cart_rescue_counts_what_was_already_hearted_once(db_session: AsyncSession) -> None:
    """«Сохранили 2 товара» должно сойтись с тем, что человек видел в корзине, а не с
    тем, сколько строк при этом реально вставилось."""
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    cream = await make_product(db_session, name="Крем")
    serum = await make_product(db_session, name="Сыворотка")

    await WishlistService(db_session).add_item(user.id, cream.id)
    await CartService(db_session).add_item(user.id, cream.id, 1)
    await CartService(db_session).add_item(user.id, serum.id, 1)

    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert [(r.saved, r.dropped) for r in closures[0].rescued_carts] == [(2, 0)]
    rows = (
        (await db_session.execute(select(WishlistItem).where(WishlistItem.user_id == user.id)))
        .scalars()
        .all()
    )
    assert len(rows) == 2  # повторной строки на уже отмеченный товар не появилось


async def test_cart_rescue_skips_discontinued_products(db_session: AsyncSession) -> None:
    """Снятый с продажи товар покупатель в своей корзине уже не видит (его отфильтровывают
    и корзина, и чекаут) — значит и «сохранили» про него говорить не о чем."""
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    live = await make_product(db_session, name="Крем")
    gone = await make_product(db_session, name="Снятый")

    await CartService(db_session).add_item(user.id, live.id, 1)
    await CartService(db_session).add_item(user.id, gone.id, 1)
    gone.deleted_at = datetime.now(UTC)
    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert [(r.saved, r.dropped) for r in closures[0].rescued_carts] == [(1, 0)]
    rows = (
        (await db_session.execute(select(WishlistItem).where(WishlistItem.user_id == user.id)))
        .scalars()
        .all()
    )
    assert [row.product_id for row in rows] == [live.id]


async def test_cart_rescue_respects_the_wishlist_ceiling(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Свип — не повод втихую сломать лимит избранного; что не влезло, покупателю
    придётся сказать."""
    monkeypatch.setattr("app.cycles.scheduler_service.MAX_WISHLIST_ITEMS", 1)
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    for name in ("Крем", "Сыворотка", "Тоник"):
        product = await make_product(db_session, name=name)
        await CartService(db_session).add_item(user.id, product.id, 1)

    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert [(r.saved, r.dropped) for r in closures[0].rescued_carts] == [(1, 2)]
    assert len((await WishlistService(db_session).get_wishlist(user.id)).items) == 1


async def test_cart_rescue_says_nothing_about_an_empty_cart(db_session: AsyncSession) -> None:
    """Пустая корзина в закрывшемся сборе — не событие, и уведомления быть не должно."""
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    await CartService(db_session).get_cart(user.id)  # корзина есть, товаров в ней нет

    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert closures[0].rescued_carts == []


async def test_notify_carts_rescued_resolves_chats_and_drops_the_dead_ones(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Свип отдаёт только id пользователей — получателей и их чаты ищет уведомление,
    и оно же убирает привязку, о смерти которой сообщил Telegram."""
    user = await make_user(db_session, telegram_chat_id=555)
    cycle = await make_cycle(db_session, label="Июнь")
    send = AsyncMock(return_value=BroadcastResult(sent=0, blocked_chat_ids=[555]))
    monkeypatch.setattr("app.telegram.notify.notifications_service.send_cart_rescued", send)

    await notify_carts_rescued(
        db_session, cycle, [CartRescue(user_id=user.id, saved=2, dropped=1)]
    )

    notices, title = send.await_args.args
    assert [(notice.user.id, notice.saved, notice.dropped) for notice in notices] == [
        (user.id, 2, 1)
    ]
    assert title == "«Июнь»"
    await db_session.refresh(user)
    assert user.telegram_chat_id is None


async def test_sweep_deadlines_tallies_what_the_owner_has_to_buy(
    db_session: AsyncSession,
) -> None:
    """The closing summary is the owner's shopping list — a cancelled order is the one
    thing on it that isn't going to be bought."""
    buyer = await make_user(db_session)
    quitter = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    product = await make_product(db_session, price_cents=1000)

    orders = OrdersService(db_session)
    await CartService(db_session).add_item(buyer.id, product.id, 3)
    await orders.checkout(buyer.id, note=None)
    await CartService(db_session).add_item(quitter.id, product.id, 5)
    cancelled = await orders.checkout(quitter.id, note=None)
    await orders.cancel(quitter.id, cancelled.id)

    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert len(closures) == 1
    assert closures[0].orders_count == 1
    assert closures[0].total_cents == 3000


async def test_sweep_deadlines_activates_next_upcoming_cycle_every_tick(
    db_session: AsyncSession,
) -> None:
    now = datetime.now(UTC)
    expiring = await make_cycle(db_session, deadline_at=now + timedelta(seconds=1), label="Old")
    upcoming = await make_cycle(db_session, deadline_at=now + timedelta(days=2), label="Next")
    expiring.deadline_at = now - timedelta(seconds=1)
    await db_session.flush()

    await CycleSchedulerService(db_session).sweep_deadlines()

    await db_session.refresh(upcoming)
    assert upcoming.status == CycleStatus.ACTIVE

    # A second tick with nothing newly expiring should keep the status in sync (not only
    # transition it as a side effect of another cycle closing in the same tick).
    await db_session.refresh(upcoming)
    upcoming.status = CycleStatus.UPCOMING
    await db_session.flush()

    await CycleSchedulerService(db_session).sweep_deadlines()

    await db_session.refresh(upcoming)
    assert upcoming.status == CycleStatus.ACTIVE
