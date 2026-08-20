"""A ceiling on the request body, applied before anything reads it."""

import logging

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("app.body_limit")

# Both upload endpoints check their own, stricter limits (`MAX_IMAGE_BYTES`,
# `MAX_IMPORT_BYTES`); this is the outer bound that has to hold before the route — and
# therefore before `require_admin` — is reached at all. Wide enough to leave those
# checks the ones that produce the readable errors.
MAX_BODY_BYTES = 12 * 1024 * 1024

METHODS_WITH_BODY = frozenset({"POST", "PUT", "PATCH"})


class BodySizeLimitMiddleware:
    """Refuses an oversized body before FastAPI spools it to disk.

    The order of operations on a multipart route is the whole reason this exists:
    FastAPI parses the form (`await request.form()`) *before* it solves dependencies, so
    `Depends(require_admin)` runs after the upload has already been written out — and
    Starlette's `max_part_size` does not apply to a part carrying a filename, which
    grows into a `SpooledTemporaryFile` without limit. An anonymous POST could therefore
    fill the container's disk (shared with Postgres) and only then be told it was not
    authorized.

    Raw ASGI, like `RateLimitMiddleware` next to it, so streaming responses stay
    streaming. Two checks: the declared `Content-Length` when there is one, and the
    bytes actually received when the body is chunked and the header can be omitted or
    understated.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self._app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in METHODS_WITH_BODY:
            await self._app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        declared = headers.get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self._max_bytes:
            await self._refuse(scope, send, int(declared))
            return

        received = 0
        refused = False

        async def counting_receive() -> Message:
            nonlocal received, refused
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self._max_bytes:
                    # Answered from here, rather than by raising: an exception thrown
                    # while FastAPI is reading the form is caught by FastAPI itself and
                    # turned into "There was an error parsing the body" — a 400 whose
                    # detail is prose, with no machine code for the site to translate and
                    # no line in this log. So the refusal goes out now, and the body is
                    # reported as ended; whatever the route decides to answer afterwards
                    # is dropped by `guarded_send`.
                    refused = True
                    await self._refuse(scope, send, received)
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            if refused:
                return
            await send(message)

        try:
            await self._app(scope, counting_receive, guarded_send)
        except Exception:
            # The route reads a stream that ended mid-body, so it fails — with
            # `ClientDisconnect`, a parser error, or whatever the endpoint makes of an
            # empty upload. The client already has its 413; re-raising would only put a
            # traceback in the log for a request this middleware refused on purpose.
            if not refused:
                raise

    async def _refuse(self, scope: Scope, send: Send, size: int) -> None:
        logger.warning(
            "Refused %s %s: body of %d bytes over the %d limit",
            scope["method"],
            scope.get("path", ""),
            size,
            self._max_bytes,
        )
        body = b'{"detail":"request_body_too_large"}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
