import uuid
from pathlib import Path
from typing import Protocol

import aiofiles

from app.config import settings


class StorageService(Protocol):
    async def save(self, filename: str, content: bytes) -> str:
        """Persists content and returns a storage key (opaque, safe to embed in a URL)."""
        ...

    def url_for(self, key: str) -> str: ...


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


storage_service: StorageService = LocalDiskStorage(
    Path(settings.upload_dir), settings.public_files_base_url
)
