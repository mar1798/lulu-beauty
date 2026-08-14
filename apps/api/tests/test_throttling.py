from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.telegram import messages, throttling
from app.telegram.handlers import router
from app.telegram.throttling import BURST, ThrottlingMiddleware


class _Clock:
    """Monotonic time under test control — the whole point of a rate limiter is timing,
    and a test that measured real seconds would either sleep or be flaky."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> _Clock:
    clock = _Clock()
    monkeypatch.setattr(throttling.time, "monotonic", clock)
    return clock


def _message(user_id: int = 42) -> MagicMock:
    message = MagicMock(spec=throttling.Message)
    message.from_user = MagicMock(id=user_id)
    message.answer = AsyncMock()
    return message


async def _run(middleware: ThrottlingMiddleware, event: Any) -> bool:
    """Whether the update reached the handler."""
    handler = AsyncMock(return_value="handled")
    result = await middleware(handler, event, {})
    return handler.await_count == 1 and result == "handled"


async def test_a_burst_of_taps_goes_through(clock: _Clock) -> None:
    """Tapping several buttons in a row is ordinary use, and a limiter that punished it
    would be wrong far more often than right."""
    middleware = ThrottlingMiddleware()
    message = _message()

    assert all([await _run(middleware, message) for _ in range(BURST)])


async def test_the_bucket_runs_out_and_the_extra_taps_are_dropped(clock: _Clock) -> None:
    middleware = ThrottlingMiddleware()
    message = _message()

    for _ in range(BURST):
        await _run(middleware, message)

    assert await _run(middleware, message) is False


async def test_waiting_refills_the_bucket(clock: _Clock) -> None:
    """The limit is a rate, not a quota: a person who slows down gets served again."""
    middleware = ThrottlingMiddleware()
    message = _message()

    for _ in range(BURST + 1):
        await _run(middleware, message)

    clock.now += 2.0

    assert await _run(middleware, message) is True


async def test_one_user_does_not_spend_another_users_budget(clock: _Clock) -> None:
    middleware = ThrottlingMiddleware()

    for _ in range(BURST + 1):
        await _run(middleware, _message(user_id=1))

    assert await _run(middleware, _message(user_id=2)) is True


async def test_a_throttled_person_is_told_once_not_on_every_drop(clock: _Clock) -> None:
    """The notice explains the silence — but repeated per dropped update it would make
    the bot the flooder, answering a held-down button with a message per press."""
    middleware = ThrottlingMiddleware()
    message = _message()

    for _ in range(BURST + 5):
        await _run(middleware, message)

    message.answer.assert_awaited_once_with(messages.TOO_FAST)


async def test_the_notice_returns_after_the_person_slows_down(clock: _Clock) -> None:
    middleware = ThrottlingMiddleware()
    message = _message()

    for _ in range(BURST + 2):
        await _run(middleware, message)

    clock.now += 60.0
    for _ in range(BURST + 2):
        await _run(middleware, message)

    assert message.answer.await_count == 2


async def test_a_throttled_callback_is_always_answered(clock: _Clock) -> None:
    """Unlike a message: an unanswered callback query leaves the client spinning on the
    button for half a minute, which reads as a dead bot rather than as a rate limit."""
    query = MagicMock(spec=throttling.CallbackQuery)
    query.from_user = MagicMock(id=7)
    query.answer = AsyncMock()
    middleware = ThrottlingMiddleware()

    for _ in range(BURST + 3):
        await _run(middleware, query)

    assert query.answer.await_count == 3


async def test_idle_buckets_are_pruned(
    clock: _Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The map is keyed by a Telegram user id — unbounded input from outside, so
    something has to drop the entries that have gone back to saying nothing."""
    monkeypatch.setattr(throttling, "PRUNE_AT", 3)
    middleware = ThrottlingMiddleware()

    for user_id in range(3):
        await _run(middleware, _message(user_id=user_id))

    clock.now += throttling.IDLE_TTL_SECONDS + 1
    await _run(middleware, _message(user_id=99))

    assert set(middleware._buckets) == {99}


def test_both_update_types_share_one_limiter() -> None:
    """Registered on messages and callbacks separately, as two instances, each would
    keep its own bucket — and the limit a person actually gets would be twice the one
    written down. Also outer, so a dropped update is never matched against a filter.
    """
    message_middlewares = list(router.message.outer_middleware)
    callback_middlewares = list(router.callback_query.outer_middleware)

    installed = [m for m in message_middlewares if isinstance(m, ThrottlingMiddleware)]
    assert installed, "на сообщениях нет троттлинга"
    assert installed[0] in callback_middlewares
