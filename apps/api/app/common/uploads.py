"""Taking an uploaded file in: size first, then the content type, then the decoder.

Shared by every endpoint that stores an image the admin uploads — product photos and
promotion banners — so the ceilings and the refusals are one rule, not two copies of it.
"""

from fastapi import HTTPException, UploadFile, status

from app.catalog.image_compression import (
    CompressedImage,
    ImageTooDetailedError,
    UnreadableImageError,
    compress_image,
)

# What may be *uploaded*. Generous because it is no longer what gets stored: every image
# is re-encoded by `compress_image` on the way in, so a 14 MB PNG straight out of a
# camera lands in `uploads` as a few hundred kilobytes of WebP.
MAX_IMAGE_BYTES = 15 * 1024 * 1024
# The declared content type is only a first filter — it is chosen by the client, and the
# decoder downstream is what actually decides whether this is an image. The stored file's
# extension comes from the compressor, never from the uploaded filename: /files is served
# as static content and is same-origin with the site (next.config.js rewrites it), so a
# name like "photo.html" would be stored and later served as a page rather than an image.
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def read_within(file: UploadFile, limit: int, code: str) -> bytes:
    """The upload's bytes, refused before they are held in memory.

    Starlette has already spooled the part to a temporary file by the time a handler runs
    and knows how long it is, so the size is answerable without reading it. Reading first
    and measuring after meant a gigabyte upload became a gigabyte `bytes` object for as
    long as it took to decide it was too big.
    """
    if file.size is not None and file.size > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, code)

    content = await file.read()
    if len(content) > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, code)
    return content


async def read_image(file: UploadFile) -> CompressedImage:
    """The uploaded image, re-encoded for storage — or the HTTP refusal that fits it."""
    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "unsupported_image_type")

    content = await read_within(file, MAX_IMAGE_BYTES, "image_too_large")

    try:
        return await compress_image(content)
    except ImageTooDetailedError as error:
        # Not `image_too_large`: that one is about the bytes the owner can see in their
        # file manager, and this is about a pixel count they cannot. A flat 40 MP export
        # travels in 128 KB and still costs a few hundred megabytes to decode.
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "image_too_many_pixels"
        ) from error
    except UnreadableImageError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "image_unreadable") from error
