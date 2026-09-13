"""What `/files/*` promises about caching.

The product photos are the heaviest thing a catalogue page pulls, and their names are
uuids: the bytes behind one address never change. Saying so is the difference between a
revalidation round trip per photo per page view and no request at all — and Next's image
optimiser reads the same header to decide how long to keep what it re-encoded.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.common.static import IMMUTABLE_CACHE_CONTROL, ImmutableStaticFiles


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    (tmp_path / "photo.jpg").write_bytes(b"not really a jpeg")

    app = FastAPI()
    app.mount("/files", ImmutableStaticFiles(directory=tmp_path, check_dir=False), name="files")

    with TestClient(app) as test_client:
        yield test_client


def test_served_file_may_be_cached_forever(client: TestClient) -> None:
    response = client.get("/files/photo.jpg")

    assert response.status_code == 200
    assert response.headers["cache-control"] == IMMUTABLE_CACHE_CONTROL


def test_not_modified_keeps_the_header(client: TestClient) -> None:
    """A 304 without `Cache-Control` restarts the clock — the next view revalidates again."""
    etag = client.get("/files/photo.jpg").headers["etag"]

    response = client.get("/files/photo.jpg", headers={"If-None-Match": etag})

    assert response.status_code == 304
    assert response.headers["cache-control"] == IMMUTABLE_CACHE_CONTROL


def test_missing_file_is_not_cached(client: TestClient) -> None:
    """A year-long "not found" would outlive the upload that fixes it."""
    response = client.get("/files/nothing.jpg")

    assert response.status_code == 404
    assert "cache-control" not in response.headers
