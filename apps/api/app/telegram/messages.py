"""Message texts for the bot — pure functions, no I/O.

Split out of `service.py` on purpose: how a message is delivered (to whom, over what,
what to do when it fails) and how it is worded change for different reasons, and there
are now nine texts rather than the original two.

Everything here is plain text — the bot sends without a `parse_mode`, so nothing needs
escaping and a product name with an underscore in it can't break a message.
"""

import logging
import uuid
from collections.abc import Sequence
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.auth.models import User
from app.cart.schemas import CartResponse
from app.common.limits import MAX_WISHLIST_ITEMS
from app.config import settings
from app.cycles.models import OrderCycle
from app.orders.models import CANCELLED_STATUSES, Order, OrderStatus
from app.orders.service import OrderItemDrop, OrderPriceChange
from app.wishlist.schemas import WishlistResponse

logger = logging.getLogger("app.telegram.messages")

CENTS_IN_UNIT = 100
# U+00A0, the group separator ru-RU's Intl.NumberFormat uses on the site, so the bot
# and the page both render "1 250 сом" (see packages/widgets/src/atoms/price).
THOUSANDS_SEPARATOR = " "
# The shop says "сом", not the ISO code in settings.currency (KGS) — that one is for
# the Excel export's column headers, where a machine-readable code is the point.
CURRENCY_LABEL = "сом"

# A Telegram message is not a dashboard: past a handful of rows nobody reads it, and
# the customer has the full list on the site.
MAX_LISTED_ORDERS = 5
MAX_LISTED_CART_ITEMS = 10
MAX_LISTED_WISHLIST_ITEMS = 10


def format_price(cents: int) -> str:
    units, remainder = divmod(cents, CENTS_IN_UNIT)
    grouped = f"{units:,}".replace(",", THOUSANDS_SEPARATOR)
    if remainder == 0:
        return f"{grouped} {CURRENCY_LABEL}"
    return f"{grouped},{remainder:02d} {CURRENCY_LABEL}"


def format_deadline(deadline_at: datetime) -> str:
    """Deadline in the shop's local timezone — these are read by customers, not developers."""
    try:
        local = deadline_at.astimezone(ZoneInfo(settings.cycle_timezone))
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Invalid CYCLE_TIMEZONE %r; falling back to UTC", settings.cycle_timezone)
        return deadline_at.isoformat()
    return local.strftime("%d.%m.%Y в %H:%M")


def plural(count: int, one: str, few: str, many: str) -> str:
    if count % 10 == 1 and count % 100 != 11:
        return one
    if 2 <= count % 10 <= 4 and not 12 <= count % 100 <= 14:
        return few
    return many


def cycle_title(cycle: OrderCycle) -> str:
    """A cycle's label is optional in the model, but every message needs to name one."""
    return f"«{cycle.label}»" if cycle.label else f"от {format_deadline(cycle.deadline_at)}"


def order_reference(order_id: uuid.UUID) -> str:
    """Short prefix of the UUID — enough for the owner and the customer to mean the same
    order out loud, without pasting 36 characters into a chat.

    Takes the id rather than the order: the deletion notice has nothing else left.
    """
    return f"#{str(order_id)[:8]}"


def _items_count(order: Order) -> str:
    count = len(order.items)
    return f"{count} {plural(count, 'позиция', 'позиции', 'позиций')}"


ORDER_STATUS_LABEL = {
    OrderStatus.PENDING: "В ожидании",
    OrderStatus.CONFIRMED: "Подтверждена",
    OrderStatus.READY: "Готова к выдаче",
    OrderStatus.COMPLETED: "Выдана",
    OrderStatus.CANCELLED_BY_CUSTOMER: "Отменена покупателем",
    OrderStatus.CANCELLED_BY_OWNER: "Отменена владельцем",
}


# ─── Outgoing notifications ──────────────────────────────────────────────────────


def cart_reminder(title: str, deadline_at: datetime) -> str:
    """`title` — уже готовое название сбора из `cycle_title` (у сбора может не быть
    подписи, и тогда он называется по дедлайну; кавычки ставит `cycle_title`)."""
    return (
        f"Напоминание: товары в вашей корзине Lulu Beauty по сбору {title} "
        f"будут удалены {format_deadline(deadline_at)}, если вы не оформите заявку."
    )


def cart_last_chance(title: str, deadline_at: datetime) -> str:
    """Второе напоминание, за несколько часов до дедлайна.

    Отдельный текст, а не повтор первого: сутками раньше сбор можно было отложить
    «на вечер», а здесь запаса уже нет — и если сообщение об этом не скажет, оно
    прочитается как то же самое напоминание второй раз.

    Срок в тексте не назван словами («меньше трёх часов») намеренно: окно живёт в
    `cycles/scheduler_service.REMINDER_STAGES`, и продублированное здесь оно рано или
    поздно начнёт врать. Точное время дедлайна отвечает на тот же вопрос честнее.
    """
    return (
        f"⏳ Последний шанс: сбор {title} закрывается {format_deadline(deadline_at)}.\n"
        "Товары из корзины Lulu Beauty удалятся, если до этого времени не оформить заявку."
    )


def cart_moved_to_wishlist(title: str, saved: int, dropped: int) -> str:
    """Сбор закрылся, а заявку так и не оформили — куда делась корзина.

    Сообщение обязано быть, даже когда переносить нечего было бы обидно: корзина
    исчезает не по действию человека, а по часам, и без этой строки он в следующий раз
    открывает пустую корзину и считает, что сайт потерял его выбор.
    """
    lines = [
        f"Сбор {title} закрыт — заявку по нему вы не оформили.",
        # Обещать «вернётся в корзину» нельзя: обратного переноса нет, товары
        # добавляются в корзину поштучно, вручную, и только при открытом сборе.
        f"Сохранили {saved} {plural(saved, 'товар', 'товара', 'товаров')} из корзины "
        "в избранном: список дождётся следующего сбора.",
    ]
    if dropped:
        fit = plural(dropped, "не поместился", "не поместились", "не поместилось")
        lines.append(
            f"Ещё {dropped} {plural(dropped, 'товар', 'товара', 'товаров')} {fit} "
            f"— в избранном уже {MAX_WISHLIST_ITEMS} позиций."
        )
    return "\n".join(lines)


def new_order_for_owner(order: Order, customer: User | None, cycle: OrderCycle | None) -> str:
    lines = [
        f"🆕 Новая заявка {order_reference(order.id)}",
        # A deleted customer cascades their orders away, so the fallback is defensive
        # only — same reasoning as _admin_order_response in orders/router.py.
        f"Покупатель: {customer.name}, {customer.phone}" if customer else "Покупатель: —",
        f"Сбор: {cycle_title(cycle)}" if cycle else "Сбор: —",
        f"Позиций: {len(order.items)}",
        f"Сумма: {format_price(order.total_cents)}",
    ]
    if order.note:
        lines.append(f"Комментарий: {order.note}")
    return "\n".join(lines)


_ORDER_STATUS_NEWS = {
    OrderStatus.CONFIRMED: "подтверждена — владелец начал закупку.",
    OrderStatus.READY: "готова к выдаче. О получении договоритесь лично.",
    OrderStatus.COMPLETED: "выдана. Спасибо за заказ!",
    OrderStatus.CANCELLED_BY_OWNER: "отменена владельцем. Если это ошибка — напишите ему.",
    # Про свою же отмену покупателю сообщать нечего: он её и сделал, а уведомление
    # выглядело бы так, будто её сделал кто-то другой.
}


def order_status_changed(order: Order) -> str | None:
    """None means "say nothing".

    PENDING is the owner undoing a cancellation, which the customer either asked for or
    never knew about — announcing it would be noise either way.
    """
    news = _ORDER_STATUS_NEWS.get(order.status)
    if news is None:
        return None
    return f"Заявка {order_reference(order.id)} {news}"


# Статусы, на которых удаление заявки — уже не новость: выданную покупатель забрал,
# отменённую он (или владелец) списал ещё раньше. В обоих случаях строка исчезает из
# таблицы у владельца, а для покупателя не меняется ничего, чего он ещё ждёт.
SILENT_DELETION_STATUSES = frozenset({OrderStatus.COMPLETED, *CANCELLED_STATUSES})


def order_deleted(order_id: uuid.UUID, status: OrderStatus) -> str | None:
    """None — «ничего не говорить», как и у `order_status_changed`.

    Заявку, которую человек ещё ждёт, удаляют молча только по недосмотру: она просто
    пропадает из «Мои заявки», и единственное объяснение, которое у него остаётся, —
    что сайт её потерял.
    """
    if status in SILENT_DELETION_STATUSES:
        return None
    return (
        f"Заявка {order_reference(order_id)} удалена владельцем. "
        "Если это ошибка — напишите ему."
    )


def order_item_repriced(
    order_id: uuid.UUID,
    product_name: str,
    old_price_cents: int,
    new_price_cents: int,
    total_cents: int,
) -> str:
    """Владелец переоценил товар, который лежит в неподтверждённой заявке.

    Обе цены в тексте, а не одна новая: «стало 1 400» без «было 1 200» человек не с чем
    сравнить — он помнит сумму заявки, а не цену строки.
    """
    direction = _price_direction(old_price_cents, new_price_cents)
    return (
        f"В заявке {order_reference(order_id)} изменилась цена.\n"
        f"{product_name}: {direction} с {format_price(old_price_cents)} "
        f"до {format_price(new_price_cents)}.\n"
        f"Сумма заявки теперь {format_price(total_cents)}."
    )


def orders_repriced(changes: Sequence[OrderPriceChange]) -> str:
    """Одна переоценка, все заявки одного человека — одним сообщением.

    Товар, который лежит в нескольких неподтверждённых заявках, — это норма: человек
    заказывает в каждом сборе. По сообщению на заявку Telegram присылал бы их подряд в
    один чат, а он держит примерно одно сообщение в секунду на чат: очередь упиралась в
    429, и до человека доходило только первое — про одну заявку из нескольких.
    """
    if len(changes) == 1:
        change = changes[0]
        return order_item_repriced(
            change.order_id,
            change.product_name,
            change.old_price_cents,
            change.new_price_cents,
            change.total_cents,
        )

    lines = [f"Изменились цены в {len(changes)} ваших заявках."]
    lines.extend(
        f"{order_reference(change.order_id)} — {change.product_name}: "
        f"{_price_direction(change.old_price_cents, change.new_price_cents)} "
        f"с {format_price(change.old_price_cents)} до {format_price(change.new_price_cents)}. "
        f"Сумма заявки теперь {format_price(change.total_cents)}."
        for change in changes
    )
    return "\n".join(lines)


def orders_items_dropped(drops: Sequence[OrderItemDrop]) -> str:
    """Снятие товара с продажи, все заявки одного человека — одним сообщением.

    По той же причине, что и `orders_repriced`, и с той же группировкой — плюс одна
    заявка может лишиться сразу нескольких строк, и это тоже одна новость, а не две.
    """
    by_order: dict[uuid.UUID, list[OrderItemDrop]] = {}
    for drop in drops:
        by_order.setdefault(drop.order_id, []).append(drop)

    if len(drops) == 1:
        drop = drops[0]
        return (
            order_cancelled_last_item_removed(drop.order_id, drop.product_name)
            if drop.is_cancelled
            else order_item_removed(drop.order_id, drop.product_name, drop.total_cents)
        )

    count = len(by_order)
    affected = plural(count, "заявку", "заявки", "заявок")
    lines = [f"Владелец снял товары с продажи — это затронуло {count} ваших {affected}."]
    for order_id, order_drops in by_order.items():
        names = ", ".join(drop.product_name for drop in order_drops)
        removed = plural(len(order_drops), "товар", "товара", "товаров")
        tail = (
            "заявка отменена, в ней больше не осталось позиций"
            if order_drops[0].is_cancelled
            else f"сумма заявки теперь {format_price(order_drops[0].total_cents)}"
        )
        lines.append(f"{order_reference(order_id)} — убран {removed}: {names}; {tail}.")
    return "\n".join(lines)


def _price_direction(old_price_cents: int, new_price_cents: int) -> str:
    return "выросла" if new_price_cents > old_price_cents else "снизилась"


def order_item_removed(order_id: uuid.UUID, product_name: str, total_cents: int) -> str:
    """Товар сняли с продажи, и заявка лишилась строки — но не вся."""
    return (
        f"Из заявки {order_reference(order_id)} убран товар: {product_name} — "
        "владелец снял его с продажи.\n"
        f"Сумма заявки теперь {format_price(total_cents)}."
    )


def order_cancelled_last_item_removed(order_id: uuid.UUID, product_name: str) -> str:
    """Та же новость, когда убранный товар был в заявке единственным.

    Отдельный текст: «сумма заявки теперь 0» — это не то, что случилось. Заявки больше
    нет в работе, и сказать надо именно это.
    """
    return (
        f"Заявка {order_reference(order_id)} отменена: владелец снял с продажи "
        f"единственный товар в ней — {product_name}.\n"
        "Соберите новую заявку, пока сбор открыт."
    )


def cycle_opened(cycle: OrderCycle) -> str:
    return (
        f"Открыт новый сбор {cycle_title(cycle)}.\n"
        f"Заявки принимаются до {format_deadline(cycle.deadline_at)}."
    )


def cycle_deadline_changed(cycle: OrderCycle, previous_deadline_at: datetime) -> str:
    """Владелец сдвинул дедлайн сбора, в котором у человека лежит корзина или заявка.

    Сдвиг назад и сдвиг вперёд — разные новости, и молчать про первый нельзя совсем:
    корзина исчезает по часам, и человек, который рассчитывал оформить её «завтра»,
    иначе узнаёт о переносе уже по опустевшей корзине. Прежний срок в тексте есть —
    без него сообщение не отличить от обычного напоминания.
    """
    moved_earlier = cycle.deadline_at < previous_deadline_at
    news = "раньше" if moved_earlier else "позже"
    lines = [
        f"Сбор {cycle_title(cycle)} закроется {news}, чем планировалось.",
        f"Было: {format_deadline(previous_deadline_at)}.",
        f"Стало: {format_deadline(cycle.deadline_at)}.",
    ]
    if moved_earlier:
        lines.append("Успейте оформить заявку — после закрытия корзина уедет в избранное.")
    else:
        lines.append("Время собрать заявку ещё есть.")
    return "\n".join(lines)


def cycle_closed_for_customer(cycle: OrderCycle) -> str:
    """Сбор закрылся, а заявка у человека есть — в отличие от `cart_moved_to_wishlist`,
    которое уходит тем, кто её так и не оформил.

    Про «изменить нельзя» прямо: до закрытия состав заявки правился на сайте, и именно
    это перестало работать — без строки об этом человек упирается в недоступные кнопки
    и считает их поломкой.
    """
    return (
        f"Сбор {cycle_title(cycle)} закрыт — заявки приняты.\n"
        "Изменить состав уже нельзя. Владелец подтвердит вашу заявку и напишет сюда, "
        "когда всё будет готово к выдаче."
    )


def order_resolution(status: OrderStatus) -> str:
    """Appended to the owner's notification once they've acted on it from the chat.

    The buttons go away with the edit, so without this line the message would end up
    saying nothing about what was decided — and a notification the owner scrolls past
    later has to answer "did I already handle this?" on its own.
    """
    return f"Статус: {ORDER_STATUS_LABEL[status]} (отсюда, из Telegram)."


def cycle_closed_for_owner(cycle: OrderCycle, orders_count: int, total_cents: int) -> str:
    return (
        f"Сбор {cycle_title(cycle)} закрыт.\n"
        f"Заявок: {orders_count}\n"
        f"Сумма: {format_price(total_cents)}\n"
        "Отменённые заявки в сумму не входят."
    )


# ─── Replies to commands ─────────────────────────────────────────────────────────

START = (
    "Добро пожаловать в Lulu Beauty! Поделитесь номером телефона, чтобы привязать "
    "этот чат к вашему аккаунту: сюда придут вход на сайт, подтверждение заявки "
    "и напоминания о дедлайне."
)

SHARE_CONTACT_BUTTON = "Поделиться номером телефона"

# ─── Main menu ───────────────────────────────────────────────────────────────────
#
# These labels are the whole interface: they are what the person taps and, being plain
# text messages, also what the handlers match on. Changing one here changes both sides
# at once — which is the point of them living in a single place.
#
# The emoji is part of the label, not decoration around it: a menu of five identical
# grey pills is read one word at a time, whereas the picture is found by shape.

MENU_CART = "🛒 Корзина"
MENU_ORDERS = "📦 Мои заявки"
MENU_WISHLIST = "⭐ Избранное"
MENU_DEADLINE = "📅 Текущий сбор"
MENU_SITE = "🌐 Сайт"
MENU_HELP = "ℹ️ Помощь"

# Sent with the keyboard itself, when there is nothing else to say — after linking, or
# when someone asks for the menu back.
MENU_PROMPT = "Чем помочь? Выберите кнопку ниже."

# ─── Inline buttons and their answers ────────────────────────────────────────────

CONFIRM_BUTTON = "✅ Подтвердить"
CANCEL_BUTTON = "❌ Отменить"
CHECKOUT_BUTTON = "Оформить заявку"
WISHLIST_BUTTON = "Посмотреть избранное"
CATALOG_BUTTON = "Открыть каталог"
ORDERS_BUTTON = "Все заявки на сайте"
SITE_BUTTON = "Открыть сайт"
ADMIN_ORDERS_BUTTON = "Заявки в админке"

# Подпись кнопки слева от поля ввода (`set_chat_menu_button`), открывающей Mini App.
# «Каталог», а не «Открыть сайт»: это не ссылка наружу, а магазин внутри Telegram,
# и человек не должен ждать, что его сейчас выкинет в браузер.
MINI_APP_BUTTON = "Каталог"

# Unlinking is the one destructive thing the bot can do, and it now sits behind a
# button rather than a typed command — so it asks first. The confirming label repeats
# the verb instead of saying "да": a lone "да" under a scrolled-past question is how
# people confirm things they didn't mean to.
UNLINK_BUTTON = "🔌 Отвязать чат"
UNLINK_CONFIRM_BUTTON = "Отвязать"
UNLINK_KEEP_BUTTON = "Оставить как есть"

UNLINK_CONFIRM = (
    "Отвязать этот чат от вашего аккаунта? Заявки и избранное останутся на сайте, но "
    "уведомления и вход через Telegram сюда больше не придут."
)
UNLINK_KEPT = "Ничего не меняю — чат остался привязан."

# Toasts, not messages: Telegram shows these on the button itself and cuts them at 200
# characters, so each says one thing and stops.
CALLBACK_NOT_FOR_YOU = "Эта кнопка работает только у владельца магазина."
CALLBACK_ORDER_GONE = "Заявка не найдена — возможно, она уже удалена."
CALLBACK_ORDER_MOVED_ON = (
    "С этой заявкой уже что-то произошло: её отменили или она ушла дальше по статусам. "
    "Откройте админку, чтобы посмотреть."
)
CALLBACK_NOT_LINKED = "Этот чат и так не привязан к аккаунту."

# Ответ на слишком частые нажатия (`throttling.py`). Про «секунду» — чтобы человек
# понял, что ждать нужно мгновение, а не что бот сломался: молчание в ответ на нажатие
# читается именно как поломка.
TOO_FAST = "Слишком много запросов подряд. Подождите секунду и попробуйте снова."


def callback_applied(status: OrderStatus) -> str:
    return f"Заявка — {ORDER_STATUS_LABEL[status].lower()}"


LINKED = "Готово! Этот чат привязан к вашему номеру телефона.\nКнопки ниже — всё, что я умею."

# Ответ на вход с сайта. Про «вернитесь на вкладку» — не вежливость: вкладка входит сама,
# и без этой строки человек остаётся в Telegram ждать кода, которого больше не бывает.
LOGIN_CONFIRMED = (
    "Вход подтверждён. Вернитесь на вкладку с сайтом — она уже впустила вас.\n"
    "Кнопки ниже — всё, что я умею."
)

# Второе сообщение сразу после входа — единственное место, где человек может узнать,
# что вход был не его. Ссылка `t.me/…?start=` — обычный текст в чате: её можно переслать,
# и до появления этой кнопки чужой тап впускал в аккаунт ту вкладку, что ссылку создала.
def login_alert(authorized_at: datetime) -> str:
    return (
        f"Вход на сайт подтверждён {format_deadline(authorized_at)}.\n"
        "Если вы не входили — например, открыли ссылку из чужого сообщения — "
        "нажмите «Это не я»: я закрою вход и завершу все сеансы на сайте."
    )


LOGIN_REJECT_BUTTON = "🚫 Это не я"

LOGIN_REJECTED = (
    "Вход отменён, все сеансы на сайте завершены.\n"
    "Чтобы войти самому, откройте сайт и нажмите «Войти через Telegram» — "
    "ссылку из чужого сообщения открывать не нужно."
)

CALLBACK_LOGIN_GONE = "Этот вход уже закрыт — отменять нечего."

ALREADY_LINKED = (
    "Этот чат уже привязан к вашему номеру. Чтобы войти на сайте, нажмите там "
    "«Войти через Telegram» — я подтвержу вход сам."
)

# Прислали чужую карточку контакта. Формулировка без обвинений: чаще всего это
# промах по списку контактов, а не попытка привязать чужой номер.
FOREIGN_CONTACT = (
    "Привязать можно только свой номер телефона. Отправьте /start и нажмите "
    "«Поделиться номером телефона» — Telegram подставит ваш номер сам."
)

NOT_LINKED = (
    "Этот чат не привязан к аккаунту. Нажмите «Поделиться номером телефона» — "
    "тогда я смогу показать ваши заявки, корзину и избранное."
)

HELP = (
    "Кнопки под полем ввода:\n"
    f"{MENU_CART} — что лежит в корзине и до какого числа её нужно оформить\n"
    f"{MENU_ORDERS} — ваши заявки и их статусы\n"
    f"{MENU_WISHLIST} — сохранённые товары; они переживают закрытие сбора\n"
    f"{MENU_DEADLINE} — когда закрывается текущий сбор\n"
    f"{MENU_SITE} — открыть магазин в браузере\n"
    f"{MENU_HELP} — этот экран; отсюда же можно отвязать чат\n\n"
    "Сам напишу, когда откроется новый сбор, когда до дедлайна останутся сутки "
    "и когда изменится статус вашей заявки.\n\n"
    "Кнопки пропали? /menu вернёт их, /help — эта справка."
)

# Ответ на любой текст, который не совпал с кнопкой. Приходит вместе с клавиатурой:
# чаще всего это как раз человек, у которого кнопки свёрнуты и который поэтому пишет
# словами, — и тогда ответ должен не объяснять, а вернуть кнопки.
FALLBACK = "Не понял вас. Выберите кнопку ниже 👇"

# Ответ кнопки «Сайт». Сама ссылка приходит кнопкой под сообщением — в тексте её
# дублировать незачем; а если сайт по конфигурации не адресуем из Telegram (локальная
# разработка), кнопки не будет, и тогда сообщение обязано назвать адрес словами.
SITE_PROMPT = "Магазин, корзина и заявки — на сайте:"


def site_unavailable(url: str) -> str:
    """Кнопку Telegram не примет — остаётся адрес текстом."""
    return f"{SITE_PROMPT}\n{url}"


UNLINKED = "Чат отвязан. Подтверждения заявок и напоминания сюда больше не придут."

# Отдельным сообщением, а не хвостом UNLINKED: клавиатура принадлежит чату, а не
# сообщению, и снять её редактированием старого сообщения нельзя — нужно новое.
UNLINK_NEXT = "Захотите вернуть — нажмите «Поделиться номером телефона» после /start."


def my_orders(orders: list[Order], total: int | None = None) -> str:
    """`total` is how many the customer has in all, not how many were passed in.

    The caller now fetches only the page it shows, so the count of what is hidden can no
    longer be derived from the list itself. It defaults to the number given, which keeps
    the message honest if a caller does hand over everything.

    The wording says «активные» because the caller (`handle_orders`) asks only for
    `OPEN_STATUSES`: «у вас пока нет заявок» would be a plain lie to someone whose
    orders are all handed over, and a bare «Ваши заявки» would read as the full history.
    """
    if not orders:
        return "Активных заявок нет — всё, что было раньше, осталось на сайте."

    shown = orders[:MAX_LISTED_ORDERS]
    lines = ["Ваши активные заявки:"]
    lines += [
        f"{order_reference(order.id)} — {_items_count(order)}, "
        f"{format_price(order.total_cents)} — {ORDER_STATUS_LABEL[order.status]}"
        for order in shown
    ]
    hidden = (total if total is not None else len(orders)) - len(shown)
    if hidden > 0:
        lines.append(f"…и ещё {hidden} — весь список на сайте.")
    return "\n".join(lines)


def my_cart(cart: CartResponse) -> str:
    if not cart.items:
        # Two different empties, and the difference matters: with no cycle open there is
        # nothing to put a cart under, and "оформите заявку" would be a dead end.
        if cart.cycle_deadline_at is None:
            return "Сейчас сбор заказов закрыт — как только откроется новый, я напишу."
        return "Корзина пуста."

    lines = ["В корзине:"]
    shown = cart.items[:MAX_LISTED_CART_ITEMS]
    lines += [
        f"• {item.product_name} × {item.quantity} — {format_price(item.line_total_cents)}"
        for item in shown
    ]
    if len(cart.items) > len(shown):
        lines.append(f"…и ещё {len(cart.items) - len(shown)}")
    lines.append(f"Итого: {format_price(cart.total_cents)}")
    if cart.cycle_deadline_at is not None:
        lines.append(f"Оформить заявку нужно до {format_deadline(cart.cycle_deadline_at)}.")
    return "\n".join(lines)


def my_wishlist(wishlist: WishlistResponse) -> str:
    """Saved products — the one list here that outlives a cycle.

    It earns a button of its own because the sweep now empties abandoned carts *into*
    it (`cart_moved_to_wishlist`), and a message pointing at a place with no way to
    open it is only half an answer.
    """
    if not wishlist.items:
        return (
            "В избранном пусто. Нажмите ♥ на товаре в каталоге — он сохранится здесь "
            "и не пропадёт, когда закроется сбор."
        )

    shown = wishlist.items[:MAX_LISTED_WISHLIST_ITEMS]
    lines = ["В избранном:"]
    lines += [f"• {item.product.name} — {format_price(item.product.price_cents)}" for item in shown]
    hidden = len(wishlist.items) - len(shown)
    if hidden > 0:
        lines.append(f"…и ещё {hidden} — весь список на сайте.")
    return "\n".join(lines)


def current_deadline(cycle: OrderCycle | None) -> str:
    if cycle is None:
        # Not a failure — an ordinary state of the shop between cycles.
        return "Сейчас сбор заказов закрыт. Как только откроется новый, я напишу."
    return f"Сбор {cycle_title(cycle)} — заявки до {format_deadline(cycle.deadline_at)}."
