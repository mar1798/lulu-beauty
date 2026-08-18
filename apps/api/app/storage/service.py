import functools
import logging
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

import aiofiles
import anyio.to_thread

from app.config import settings

logger = logging.getLogger("app.storage")


class StorageService(Protocol):
    async def save(self, filename: str, content: bytes) -> str:
        """Persists content and returns a storage key (opaque, safe to embed in a URL)."""
        ...

    def url_for(self, key: str) -> str: ...

    async def delete_by_url(self, url: str) -> None:
        """Removes the file behind a stored url. A url that isn't ours is ignored."""
        ...


class LocalDiskStorage:
    def __init__(self, upload_dir: Path, public_base_url: str) -> None:
        self._upload_dir = upload_dir
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._public_base_url = public_base_url.rstrip("/")

    async def save(self, filename: str, content: bytes) -> str:
        key = f"{uuid.uuid4()}{Path(filename).suffix}"
        async with aiofiles.open(self._upload_dir / key, "wb") as file:
            await file.write(content)
        return key

    def url_for(self, key: str) -> str:
        return f"{self._public_base_url}/{key}"

    async def delete_by_url(self, url: str) -> None:
        """Deletes the file a `product_images.url` points at, if this storage owns it.

        Nothing used to remove these: replacing a product's photo dropped the row and
        left the bytes, so the `uploads` volume only ever grew — up to 5 MB per re-upload,
        with no way to tell an orphan from a live file after the fact.

        The url is not trusted as a path. Only the last segment is used, and only after
        the address has been recognised as one this storage produced: a stored value is
        normally ours, but `product_images.url` is a plain column and the day it holds
        something else, "delete whatever this resolves to" must not be what happens.
        """
        key = self._key_from_url(url)
        if key is None:
            return

        # missing_ok, because losing the race with another delete (or with a file removed
        # by hand) is not a failure — the goal is that the file is gone.
        await anyio.to_thread.run_sync(
            functools.partial((self._upload_dir / key).unlink, missing_ok=True)
        )

    def _key_from_url(self, url: str) -> str | None:
        prefix = f"{self._public_base_url}/"
        if not url.startswith(prefix):
            return None

        key = url[len(prefix) :]
        # `Path(key).name` alone would already flatten "../../etc/passwd", but a key that
        # needed flattening is not a key this storage wrote — so it is refused rather than
        # quietly repaired.
        if not key or key != Path(key).name or key in (".", ".."):
            return None
        return key


storage_service: StorageService = LocalDiskStorage(
    Path(settings.upload_dir), settings.public_files_base_url
)


async def discard_files(urls: Sequence[str]) -> None:
    """Removes files whose rows are already gone. Runs after the commit, never before.

    Queued as a background task by the catalog router, for the same reason the Telegram
    notifications are: the response has already been written, and a filesystem that
    refused the unlink has nothing to tell the owner that they could act on — so it is
    logged rather than raised, exactly like a failed notification.
    """
    for url in urls:
        try:
            await storage_service.delete_by_url(url)
        except OSError:
            logger.exception("Failed to remove the file behind %s", url)
