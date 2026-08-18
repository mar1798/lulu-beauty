from pathlib import Path
from unittest import mock

import pytest

from app.storage.service import LocalDiskStorage, discard_files, storage_service


async def test_save_writes_file_and_preserves_extension(tmp_path: Path) -> None:
    storage = LocalDiskStorage(tmp_path, "http://localhost:3001/files")

    key = await storage.save("photo.png", b"fake-image-bytes")

    assert key.endswith(".png")
    assert (tmp_path / key).read_bytes() == b"fake-image-bytes"


async def test_save_generates_unique_keys(tmp_path: Path) -> None:
    storage = LocalDiskStorage(tmp_path, "http://localhost:3001/files")

    key_a = await storage.save("photo.png", b"a")
    key_b = await storage.save("photo.png", b"b")

    assert key_a != key_b


def test_url_for_joins_base_url_and_key(tmp_path: Path) -> None:
    storage = LocalDiskStorage(tmp_path, "http://localhost:3001/files/")

    assert storage.url_for("abc.png") == "http://localhost:3001/files/abc.png"


def test_constructor_creates_upload_dir_if_missing(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "uploads"

    LocalDiskStorage(target, "http://localhost:3001/files")

    assert target.is_dir()


async def test_delete_by_url_removes_the_file_it_saved(tmp_path: Path) -> None:
    storage = LocalDiskStorage(tmp_path, "http://localhost:3001/files")
    key = await storage.save("photo.png", b"bytes")

    await storage.delete_by_url(storage.url_for(key))

    assert not (tmp_path / key).exists()


async def test_delete_by_url_is_a_no_op_for_a_file_that_is_already_gone(tmp_path: Path) -> None:
    """Losing the race with another delete is not a failure — the goal is that it's gone."""
    storage = LocalDiskStorage(tmp_path, "http://localhost:3001/files")

    await storage.delete_by_url("http://localhost:3001/files/never-existed.png")


@pytest.mark.parametrize(
    "url",
    [
        # Not this storage's address at all.
        "https://cdn.example.com/photo.png",
        "photo.png",
        # Ours by prefix, but the key is a path rather than a key. `product_images.url` is
        # a plain column, so "delete whatever this resolves to" must not be what happens.
        "http://localhost:3001/files/../../etc/passwd",
        "http://localhost:3001/files/nested/photo.png",
        "http://localhost:3001/files/",
        "http://localhost:3001/files/.",
    ],
)
async def test_delete_by_url_ignores_anything_that_is_not_one_of_its_keys(
    tmp_path: Path, url: str
) -> None:
    outsider = tmp_path.parent / "passwd"
    outsider.write_text("do not touch")
    storage = LocalDiskStorage(tmp_path / "uploads", "http://localhost:3001/files")

    await storage.delete_by_url(url)

    assert outsider.exists()


async def test_discard_files_survives_a_url_it_cannot_delete(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """It runs as a background task after the response is out: a filesystem that refused
    the unlink has nothing to tell the owner that they could act on."""
    with mock.patch.object(storage_service, "delete_by_url", side_effect=OSError("read-only fs")):
        await discard_files(["http://localhost:3001/files/a.png"])

    assert "Failed to remove the file" in caplog.text
