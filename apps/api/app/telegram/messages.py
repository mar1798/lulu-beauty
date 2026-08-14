"""Message texts for the bot — pure functions, no I/O.

Split out of `service.py` on purpose: how a message is delivered (to whom, over what,
what to do when it fails) and how it is worded change for different reasons, and there
are now nine texts rather than the original two.

Everything here is plain text — the bot sends without a `parse_mode`, so nothing needs
escaping and a product name with an underscore in it can't break a message.
"""

import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.auth.models import User
from app.cart.schemas import CartResponse
from app.common.limits import MAX_WISHLIST_ITEMS
from app.config import settings
from app.cycles.models import OrderCycle
from app.orders.models import Order, OrderStatus
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
    OrderStatus.CANCELLED: "Отменена",
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
        # «оттуда всё вернётся», а не «их можно вернуть»: местоимение пришлось бы
        # согласовывать с числом, а число здесь бывает и единицей.
        f"Сохранили {saved} {plural(saved, 'товар', 'товара', 'товаров')} из корзины "
        "в избранном: оттуда всё вернётся в корзину одним нажатием, когда откроется "
        "следующий сбор.",
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
    OrderStatus.CANCELLED: "отменена владельцем. Если это ошибка — напишите ему.",
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
SILENT_DELETION_STATUSES = frozenset({OrderStatus.COMPLETED, OrderStatus.CANCELLED})


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


def cycle_opened(cycle: OrderCycle) -> str:
    return (
        f"Открыт новый сбор {cycle_title(cycle)}.\n"
        f"Заявки принимаются до {format_deadline(cycle.deadline_at)}."
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
    f"{MENU_HELP} — этот экран; отсюда же можно отвязать чат\n\n"
    "Сам напишу, когда откроется новый сбор, когда до дедлайна останутся сутки "
    "и когда изменится статус вашей заявки.\n\n"
    "Кнопки пропали? /menu вернёт их, /help — эта справка."
)

# Ответ на любой текст, который не совпал с кнопкой. Приходит вместе с клавиатурой:
# чаще всего это как раз человек, у которого кнопки свёрнуты и который поэтому пишет
# словами, — и тогда ответ должен не объяснять, а вернуть кнопки.
FALLBACK = "Не понял вас. Выберите кнопку ниже 👇"

UNLINKED = "Чат отвязан. Подтверждения заявок и напоминания сюда больше не придут."

# Отдельным сообщением, а не хвостом UNLINKED: клавиатура принадлежит чату, а не
# сообщению, и снять её редактированием старого сообщения нельзя — нужно новое.
UNLINK_NEXT = "Захотите вернуть — нажмите «Поделиться номером телефона» после /start."


def my_orders(orders: list[Order], total: int | None = None) -> str:
    """`total` is how many the customer has in all, not how many were passed in.

    The caller now fetches only the page it shows, so the count of what is hidden can no
    longer be derived from the list itself. It defaults to the number given, which keeps
    the message honest if a caller does hand over everything.
    """
    if not orders:
        return "У вас пока нет заявок."

    shown = orders[:MAX_LISTED_ORDERS]
    lines = ["Ваши заявки:"]
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
