from pathlib import Path

from app.storage.service import LocalDiskStorage


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
