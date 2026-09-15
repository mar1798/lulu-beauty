"""Re-encoding of an uploaded product photo, done once, on the way in.

A photo is uploaded by one person and then served to everyone, so the work belongs
here rather than at read time: the bytes that reach `uploads` are the bytes the site
(and Next's image optimiser behind `/files/*`) works from forever after.

The output is WebP, whatever came in. A phone-sized PNG of a jar of cream is typically
10-20x its own size in WebP at this quality with nothing visible lost, and the format
keeps the alpha channel a PNG may have brought along — which is why this is a re-encode
and not PNG palette quantisation in the manner of the usual "compress PNG" services.
"""

import io
from dataclasses import dataclass

import anyio
import anyio.to_thread
from PIL import Image, ImageOps, UnidentifiedImageError

# The longest side a stored photo may have. Well past what the catalog renders (the
# product page asks the optimiser for 1200px at most) with room for a retina crop.
MAX_DIMENSION = 2000

# 82 is the usual sweet spot for photographs: artefacts stay invisible at 100% and the
# curve above it buys size, not quality. `method=6` is the slowest, smallest encoder —
# a fraction of a second per photo, paid once by the owner rather than by every visitor.
WEBP_QUALITY = 82
WEBP_METHOD = 6

# A decompression-bomb ceiling, checked from the header before a single row is decoded.
# A 20 KB PNG can otherwise declare 50000x50000 and take the process down with it.
#
# 24 MP is past every phone the shop is photographed with and comfortably past what a
# 2000px WebP can show. It is deliberately not "as much as Pillow will bear": the cost of
# a picture here is set by its pixel count, not by its size on the wire — a flat 40 MP PNG
# travels in 128 KB and still costs a couple of hundred megabytes to decode. Pillow's own
# `MAX_IMAGE_PIXELS` is left alone — it is a module-wide global, and it only warns.
MAX_PIXELS = 24_000_000

# How many photos may be decoded at once, across every request in the process. The work
# is bounded by memory rather than by CPU, and the default `anyio` pool would let forty
# of them in — enough of them at the ceiling above to leave nothing on a 4 GB box for
# Postgres next door. Two keeps a second upload from waiting on the first for no reason
# while holding the worst case to something the machine has.
DECODE_LIMITER = anyio.CapacityLimiter(2)

# What the decoder will open. The route already filters on the declared content type, but
# that is the client's word: without this, any format Pillow has a plugin for (TIFF, ICO,
# TGA, an animated GIF) is accepted under a `Content-Type: image/png`, and the parsers for
# the formats nobody here uploads are exactly the ones that get the CVEs.
ALLOWED_FORMATS = ["JPEG", "PNG", "WEBP"]

WEBP_EXTENSION = ".webp"

# Only for the "the original was already smaller" path below. Pillow's `format` is read
# from the file's own magic bytes, not from the upload's content type.
SOURCE_EXTENSIONS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}

# Keys Pillow puts in `info` for the metadata blocks an upload may carry. Their presence
# is what disqualifies a file from being stored as it arrived — see `_is_only_pixels`.
METADATA_KEYS = ("exif", "XML:com.adobe.xmp", "xmp", "icc_profile", "comment")


class UnreadableImageError(Exception):
    """The upload is not an image Pillow can decode, whatever its content type said."""


class ImageTooDetailedError(Exception):
    """A real image, refused for its pixel count rather than for its bytes.

    Separate from `UnreadableImageError` because the two need different words: this one
    is somebody's genuine photo from a genuine camera, and "the file is corrupt" would
    send them to re-export a file that is perfectly fine instead of scaling it down.
    """


@dataclass(frozen=True)
class CompressedImage:
    content: bytes
    extension: str


async def compress_image(content: bytes) -> CompressedImage:
    """The photo to store, off the event loop.

    Decoding and encoding are CPU-bound C calls of the order of a second for a large
    PNG. On the event loop that second is one the bot, the scheduler and every other
    request spend waiting, since the whole API is a single process.

    Through `DECODE_LIMITER`, so that the number of photos held decoded in memory at once
    is a number this module chose rather than the size of the default thread pool.
    """
    return await anyio.to_thread.run_sync(_compress, content, limiter=DECODE_LIMITER)


def _compress(content: bytes) -> CompressedImage:
    try:
        with Image.open(io.BytesIO(content), formats=ALLOWED_FORMATS) as image:
            source_format = image.format
            if image.width * image.height > MAX_PIXELS:
                raise ImageTooDetailedError("more pixels than the ceiling allows")

            # Scaling comes first, before the picture is ever held at its own size.
            # `thumbnail` asks the decoder for a reduced image where the format can give
            # one (a JPEG is downscaled inside the DCT, never fully expanded), and the
            # transpose below then copies a 2000px picture instead of a 24 MP one. The
            # box is square, so whether the photo is turned before or after it is fitted
            # into that box makes no difference to what comes out.
            resized = max(image.size) > MAX_DIMENSION
            if resized:
                image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

            # A phone writes the sensor's orientation into EXIF and leaves the pixels as
            # they were, and a WebP written from those pixels has nowhere to keep the tag
            # — the photo would arrive on its side. This rotates the pixels themselves.
            # Nothing else from EXIF is carried over, which also means the GPS
            # coordinates of the owner's kitchen are not published with the photo.
            upright = ImageOps.exif_transpose(image) or image

            prepared = upright.convert("RGBA" if _has_alpha(upright) else "RGB")

            buffer = io.BytesIO()
            prepared.save(buffer, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)

            keep_original = _is_only_pixels(content, image, source_format)
    except UnidentifiedImageError as error:
        raise UnreadableImageError("unrecognised image") from error
    except Image.DecompressionBombError as error:
        # Pillow's own ceiling, which `Image.open` applies before this module sees the
        # size at all. It is much higher than `MAX_PIXELS`, so it only catches the
        # extremes — but it arrives as an exception of its own, not an OSError.
        raise ImageTooDetailedError("more pixels than Pillow will decode at all") from error
    except OSError as error:
        # A truncated or malformed file fails here, in the decoder, not at `open`.
        raise UnreadableImageError("could not decode the image") from error

    encoded = buffer.getvalue()

    # A small logo, or a photo somebody already compressed, can encode larger than it
    # arrived. Storing the bigger file to be consistent about the format would be the
    # one case where "compression" made things worse, so the original wins — but only a
    # file that is nothing but its pixels (`_is_only_pixels`). Every other path here
    # rebuilds the picture from decoded pixels and so cannot carry anything along; this
    # one hands the upload's own bytes to the disk, and an upload's own bytes may hold
    # the EXIF this function exists to strip, an orientation tag nothing will apply
    # once the file is served, or a payload appended past the end of the image.
    source_extension = SOURCE_EXTENSIONS.get(source_format or "")
    if (
        keep_original
        and not resized
        and source_extension is not None
        and len(encoded) >= len(content)
    ):
        return CompressedImage(content=content, extension=source_extension)

    return CompressedImage(content=encoded, extension=WEBP_EXTENSION)


def _is_only_pixels(content: bytes, image: Image.Image, source_format: str | None) -> bool:
    """Whether this upload can be stored exactly as it arrived.

    Two questions, and both have to answer yes. Does the file declare any metadata —
    EXIF, XMP, an ICC profile, a comment? And does the image end where the file ends?
    Every decoder here stops at the marker that closes the picture and never looks at
    what follows, so a valid photo with a megabyte of anything at all glued to its tail
    decodes perfectly and says nothing about the tail.
    """
    if image.getexif() or any(key in image.info for key in METADATA_KEYS):
        return False

    if source_format == "PNG":
        # The IEND chunk: four zero length bytes, the type, and its (constant) CRC.
        return content.endswith(b"IEND\xaeB`\x82")
    if source_format == "JPEG":
        return content.endswith(b"\xff\xd9")
    if source_format == "WEBP":
        # RIFF carries its own length, in the four bytes after the magic, counted from
        # the end of that field. Anything past it is not part of the file.
        return len(content) >= 8 and int.from_bytes(content[4:8], "little") == len(content) - 8
    return False


def _has_alpha(image: Image.Image) -> bool:
    return image.mode in ("RGBA", "LA", "PA") or (
        image.mode == "P" and "transparency" in image.info
    )
