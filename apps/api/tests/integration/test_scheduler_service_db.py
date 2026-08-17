from dataclasses import replace
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import CartItem
from app.cart.service import CartService
from app.cycles.models import CycleStatus
from app.cycles.scheduler_service import CartRescue, CycleSchedulerService
from app.cycles.service import CycleAlreadyClosedError, CyclesService
from app.orders.service import OrdersService
from app.telegram.notify import notify_carts_rescued, notify_cycle_reminders
from app.telegram.service import BroadcastResult
from app.wishlist.models import WishlistItem
from app.wishlist.service import WishlistService
from tests.integration.factories import make_cycle, make_product, make_user


async def test_reminders_are_planned_once_per_stage_and_stamping_closes_them(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=20))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)

    service = CycleSchedulerService(db_session)

    first = await service.plan_reminders()
    assert [reminder.user_ids for reminder in first] == [[user.id]]
    assert first[0].last_chance is False
    # Планирование ничего не пишет — до отправки стадия остаётся открытой.
    assert cycle.reminder_sent_at is None

    await service.mark_reminders_sent(first)
    await db_session.refresh(cycle)
    assert cycle.reminder_sent_at is not None
    assert cycle.final_reminder_sent_at is None  # три часа ещё не наступили

    # reminder_sent_at закрывает вход: повторный тик не планирует ничего заново.
    assert await service.plan_reminders() == []

    # Дедлайн подошёл вплотную — теперь очередь второго, последнего напоминания.
    cycle.deadline_at = datetime.now(UTC) + timedelta(hours=2)
    await db_session.flush()

    second = await service.plan_reminders()
    assert [reminder.user_ids for reminder in second] == [[user.id]]
    assert second[0].last_chance is True

    await service.mark_reminders_sent(second)
    await db_session.refresh(cycle)
    assert cycle.final_reminder_sent_at is not None
    assert await service.plan_reminders() == []


async def test_a_reminder_that_was_not_stamped_is_planned_again(
    db_session: AsyncSession,
) -> None:
    """Падение между отправкой и отметкой означает повтор, а не потерю.

    Из двух исходов дубликат — это неудобство, а несостоявшееся напоминание о дедлайне —
    это заявка, которую покупатель не подал. Поэтому отметка идёт после отправки, и
    неотмеченный сбор снова попадает в план.
    """
    user = await make_user(db_session)
    await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    service = CycleSchedulerService(db_session)

    assert len(await service.plan_reminders()) == 1
    # Отметка не дошла — следующий тик обязан спланировать то же самое заново.
    assert len(await service.plan_reminders()) == 1


async def test_reminders_plan_only_the_last_chance_for_a_late_cycle(
    db_session: AsyncSession,
) -> None:
    """Сбор, открытый за час до собственного дедлайна, попадает в оба окна сразу.
    Предупреждение «за сутки», тут же опровергнутое «последним шансом», — не два
    уведомления, а одно испорченное."""
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)

    service = CycleSchedulerService(db_session)
    reminders = await service.plan_reminders()

    assert len(reminders) == 1
    assert reminders[0].last_chance is True
    assert reminders[0].user_ids == [user.id]

    await service.mark_reminders_sent(reminders)
    await db_session.refresh(cycle)
    # Обогнанная стадия помечена отправленной, иначе следующий тик пришлёт её вдогонку.
    assert cycle.reminder_sent_at is not None
    assert cycle.final_reminder_sent_at is not None


async def test_reminders_skip_users_who_already_checked_out(db_session: AsyncSession) -> None:
    """Сбор всё равно планируется — но с пустой аудиторией, чтобы стадии закрылись.

    Иначе цикл, в котором все уже оформились, каждый тик до самого дедлайна заново
    пересчитывал бы получателей.
    """
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    await OrdersService(db_session).checkout(user.id, note=None)

    service = CycleSchedulerService(db_session)
    reminders = await service.plan_reminders()

    assert [reminder.user_ids for reminder in reminders] == [[]]

    await service.mark_reminders_sent(reminders)
    await db_session.refresh(cycle)
    assert cycle.final_reminder_sent_at is not None
    assert await service.plan_reminders() == []


async def test_planning_sends_nothing_and_an_empty_audience_is_not_broadcast(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Рассылка — работа вызывающего, между планированием и отметкой.

    Отправка изнутри свёртки держала транзакцию открытой на всё время похода в Telegram.
    """
    broadcast = AsyncMock(return_value=BroadcastResult(sent=1, blocked_chat_ids=[]))
    monkeypatch.setattr("app.telegram.notify.notifications_service.broadcast_reminder", broadcast)
    user = await make_user(db_session)
    await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)

    reminders = await CycleSchedulerService(db_session).plan_reminders()
    broadcast.assert_not_awaited()

    await notify_cycle_reminders(db_session, reminders)

    broadcast.assert_awaited_once()
    assert [recipient.id for recipient in broadcast.await_args.args[0]] == [user.id]

    # Сбор без получателей планируется ради отметки, но рассылать в него нечего.
    broadcast.reset_mock()
    await notify_cycle_reminders(db_session, [replace(reminders[0], user_ids=[])])
    broadcast.assert_not_awaited()


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


async def test_cart_rescue_covers_someone_who_kept_shopping_after_ordering(
    db_session: AsyncSession,
) -> None:
    """Та самая пропажа из BUGS п. 11: заявка оформлена, покупатель продолжил набирать
    корзину — и на дедлайне вторая охапка удалялась, ни разу не побывав в избранном.

    Фильтр «у кого нет заявки в этом сборе» отбрасывал такие корзины целиком, хотя
    защищал он ровно от одного — сообщения «корзина в избранном» тому, у кого она
    пустая. Пустые и так пропускаются ниже, по составу.
    """
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    ordered = await make_product(db_session, name="Крем")
    later = await make_product(db_session, name="Сыворотка")

    cart = CartService(db_session)
    await cart.add_item(user.id, ordered.id, 1)
    await OrdersService(db_session).checkout(user.id, note=None)
    await cart.add_item(user.id, later.id, 2)

    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closures = await CycleSchedulerService(db_session).sweep_deadlines()

    assert [(r.saved, r.dropped) for r in closures[0].rescued_carts] == [(1, 0)]
    saved = await WishlistService(db_session).get_wishlist(user.id)
    assert {item.product.name for item in saved.items} == {"Сыворотка"}


async def test_close_now_does_everything_the_deadline_would_have(
    db_session: AsyncSession,
) -> None:
    """Досрочное закрытие — не «перестать принимать», а тот же самый конец сбора:
    корзины в избранное, итог владельцу, следующий сбор — на очередь."""
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=3))
    product = await make_product(db_session, name="Крем", price_cents=1500)
    await CartService(db_session).add_item(user.id, product.id, 2)

    service = CycleSchedulerService(db_session)
    closure = await service.close_now(cycle.id)

    assert closure.cycle.status is CycleStatus.CLOSED
    assert closure.cycle.closed_at is not None
    # Дедлайн не переписывается: обещание покупателям остаётся в истории как было.
    assert closure.cycle.deadline_at > datetime.now(UTC)
    assert [(r.saved, r.dropped) for r in closure.rescued_carts] == [(1, 0)]
    saved = await WishlistService(db_session).get_wishlist(user.id)
    assert {item.product.name for item in saved.items} == {"Крем"}

    # И, главное, сбор перестал быть активным — иначе корзины набирались бы заново
    # в уже закупленный сбор.
    assert await CyclesService(db_session).get_active_cycle() is None

    with pytest.raises(CycleAlreadyClosedError):
        await service.close_now(cycle.id)
