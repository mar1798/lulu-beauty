import asyncio
from typing import Any

from app.telegram.concurrency import ConcurrencyLimitMiddleware
from app.telegram.handlers import router
from app.telegram.throttling import ThrottlingMiddleware


async def test_no_more_than_the_limit_run_at_once_and_the_rest_wait() -> None:
    """Every update is handled in the end — the limit queues, it never drops."""
    middleware = ConcurrencyLimitMiddleware(limit=2)
    running = 0
    peak = 0
    release = asyncio.Event()

    async def handler(event: Any, data: dict[str, Any]) -> str:
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await release.wait()
        running -= 1
        return "handled"

    tasks = [asyncio.create_task(middleware(handler, object(), {})) for _ in range(5)]
    await asyncio.sleep(0)
    assert running == 2

    release.set()
    results = await asyncio.gather(*tasks)

    assert peak == 2
    assert results == ["handled"] * 5


async def test_a_failing_handler_gives_its_slot_back() -> None:
    middleware = ConcurrencyLimitMiddleware(limit=1)

    async def failing(event: Any, data: dict[str, Any]) -> None:
        raise RuntimeError("boom")

    async def handler(event: Any, data: dict[str, Any]) -> str:
        return "handled"

    try:
        await middleware(failing, object(), {})
    except RuntimeError:
        pass

    assert await asyncio.wait_for(middleware(handler, object(), {}), timeout=1) == "handled"


def test_both_update_types_share_one_limit_behind_the_throttle() -> None:
    """One instance, or each update type would get its own slots; after the throttle, so
    a dropped update never waits for a slot."""
    message_middlewares = list(router.message.outer_middleware)
    callback_middlewares = list(router.callback_query.outer_middleware)

    installed = [m for m in message_middlewares if isinstance(m, ConcurrencyLimitMiddleware)]
    assert installed, "на сообщениях нет ограничения одновременных апдейтов"
    assert installed[0] in callback_middlewares
    throttle = next(m for m in message_middlewares if isinstance(m, ThrottlingMiddleware))
    assert message_middlewares.index(throttle) < message_middlewares.index(installed[0])
