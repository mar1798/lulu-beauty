"""The ceiling on a request body, and the two ways a body announces its size.

Both paths matter and they fail differently. A browser uploading a file declares
`Content-Length`, so the refusal can happen before a byte of it is read. Anything
streaming — `curl -T`, an HTTP client handed a generator — sends chunked, declares
nothing, and the size is only knowable as it arrives; that is the shape an attacker
picks, and the one where the middleware has to answer from inside the read.
"""

import io
from collections.abc import Iterator

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.common.body_limit import BodySizeLimitMiddleware

LIMIT = 1024
BOUNDARY = "zzzzzzzzzzzz"


@pytest.fixture
def client() -> Iterator[TestClient]:
    """An app whose only route needs the body — like the upload routes this guards.

    Reading the form in the endpoint is the point: FastAPI parses a multipart body
    *before* it solves dependencies, so on the real routes the upload is already spooled
    to disk by the time `require_admin` gets a say.
    """
    app = FastAPI()
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=LIMIT)

    @app.post("/upload")
    async def upload(request: Request) -> dict[str, int]:
        form = await request.form()
        uploaded = form["file"]
        assert not isinstance(uploaded, str)
        return {"size": len(await uploaded.read())}

    with TestClient(app) as ready:
        yield ready


def multipart(body: bytes) -> bytes:
    head = (
        f"--{BOUNDARY}\r\n"
        'Content-Disposition: form-data; name="file"; filename="x.xlsx"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode()
    return head + body + f"\r\n--{BOUNDARY}--\r\n".encode()


def test_a_body_under_the_limit_reaches_the_route(client: TestClient) -> None:
    response = client.post("/upload", files={"file": ("x.xlsx", io.BytesIO(b"ok" * 10))})

    assert response.status_code == 200
    assert response.json() == {"size": 20}


def test_a_declared_oversize_body_is_refused_before_it_is_read(client: TestClient) -> None:
    response = client.post("/upload", files={"file": ("x.xlsx", io.BytesIO(b"x" * (LIMIT * 2)))})

    assert response.status_code == 413
    assert response.json() == {"detail": "request_body_too_large"}


def test_a_chunked_oversize_body_is_refused_as_it_arrives(client: TestClient) -> None:
    """No `Content-Length` to check, so the count has to happen inside the read.

    Regression: raising from the receive callable put the refusal where FastAPI's own
    `except Exception` around form parsing caught it, and the caller got a 400 with prose
    in `detail` instead of the machine code the site knows how to translate.
    """

    def stream() -> Iterator[bytes]:
        yield multipart(b"")[:-2]
        for _ in range(4):
            yield b"y" * LIMIT

    response = client.post(
        "/upload",
        content=stream(),
        headers={"content-type": f"multipart/form-data; boundary={BOUNDARY}"},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "request_body_too_large"}


def test_a_chunked_body_under_the_limit_still_reaches_the_route(client: TestClient) -> None:
    def stream() -> Iterator[bytes]:
        yield multipart(b"ok" * 10)

    response = client.post(
        "/upload",
        content=stream(),
        headers={"content-type": f"multipart/form-data; boundary={BOUNDARY}"},
    )

    assert response.status_code == 200
    assert response.json() == {"size": 20}


def test_a_request_without_a_body_is_left_alone(client: TestClient) -> None:
    """GET carries no body, and the middleware must not stand between it and the route."""
    assert client.get("/upload").status_code == 405
