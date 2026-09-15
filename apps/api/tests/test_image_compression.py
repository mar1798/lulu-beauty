"""What happens to a product photo between the upload and the disk.

The cases that matter are the ones where "just re-encode it" is the wrong answer: a
photo rotated by EXIF, a PNG whose transparency would turn black, a file that is not an
image at all, and the small picture that a re-encode would only make bigger.
"""

import io

import pytest
from PIL import Image

from app.catalog.image_compression import (
    MAX_DIMENSION,
    MAX_PIXELS,
    ImageTooDetailedError,
    UnreadableImageError,
    _compress,
    compress_image,
)


def _png(width: int, height: int, *, mode: str = "RGB", color: object = (200, 30, 60)) -> bytes:
    buffer = io.BytesIO()
    Image.new(mode, (width, height), color).save(buffer, "PNG")  # type: ignore[arg-type]
    return buffer.getvalue()


def _photo(width: int, height: int) -> bytes:
    """A PNG shaped like a real photograph: smooth gradients, no flat fill.

    Flat colour would not be a fair test of size — PNG stores it in a few hundred bytes
    and no lossy encoder can beat that.
    """
    image = Image.new("RGB", (width, height))
    image.putdata(
        [
            (x * 255 // width, y * 255 // height, (x * y) // ((width * height) // 255 + 1))
            for y in range(height)
            for x in range(width)
        ]
    )
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


async def test_stores_a_large_png_as_a_much_smaller_webp() -> None:
    original = _photo(2400, 1800)

    compressed = await compress_image(original)

    assert compressed.extension == ".webp"
    assert len(compressed.content) < len(original) / 3
    assert Image.open(io.BytesIO(compressed.content)).format == "WEBP"


def test_scales_the_longest_side_down_to_the_ceiling() -> None:
    compressed = _compress(_photo(MAX_DIMENSION * 2, MAX_DIMENSION))

    stored = Image.open(io.BytesIO(compressed.content))
    assert stored.size == (MAX_DIMENSION, MAX_DIMENSION // 2)


def test_leaves_a_photo_under_the_ceiling_at_its_own_size() -> None:
    compressed = _compress(_photo(800, 600))

    assert Image.open(io.BytesIO(compressed.content)).size == (800, 600)


def test_keeps_transparency_instead_of_flattening_it() -> None:
    transparent = _png(64, 64, mode="RGBA", color=(0, 0, 0, 0))

    compressed = _compress(transparent)

    stored = Image.open(io.BytesIO(compressed.content))
    assert stored.mode in ("RGBA", "RGB")
    assert stored.convert("RGBA").getpixel((0, 0))[3] == 0


def test_rotates_a_photo_its_exif_says_is_sideways() -> None:
    # Orientation 6: the sensor was portrait, the pixels were written landscape. WebP has
    # nowhere to keep the tag, so the pixels themselves have to be turned.
    image = Image.new("RGB", (400, 200), (10, 120, 200))
    exif = image.getexif()
    exif[274] = 6
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif)

    compressed = _compress(buffer.getvalue())

    assert Image.open(io.BytesIO(compressed.content)).size == (200, 400)


def _already_webp(*, exif: Image.Exif | None = None) -> bytes:
    """A photo somebody already saved as WebP — the case the original wins."""
    buffer = io.BytesIO()
    source = Image.open(io.BytesIO(_photo(600, 400)))
    extra = {"exif": exif} if exif is not None else {}
    source.save(buffer, "WEBP", quality=82, method=6, **extra)
    return buffer.getvalue()


def test_keeps_the_original_when_re_encoding_would_grow_it() -> None:
    # A second lossy pass over an already-compressed photo costs bytes and quality both,
    # and storing the bigger file would be the one case where this made things worse.
    original = _already_webp()

    compressed = _compress(original)

    assert compressed.content == original
    assert compressed.extension == ".webp"


def test_never_stores_the_original_when_it_carries_metadata() -> None:
    """The EXIF of a file small enough to keep is still the owner's kitchen.

    The "keep the original" path is the only one that hands an upload's own bytes to the
    disk, so it is the only one that could publish the GPS tag, the camera's serial or a
    rotation nothing downstream applies. Re-encoding costs a few bytes here and strips
    all of it.
    """
    exif = Image.Exif()
    exif[271] = "SecretCameraMake"  # Make
    exif[274] = 6  # Orientation
    exif[305] = "the owner's phone"  # Software
    original = _already_webp(exif=exif)

    compressed = _compress(original)

    assert compressed.content != original
    stored = Image.open(io.BytesIO(compressed.content))
    assert dict(stored.getexif()) == {}
    assert b"SecretCameraMake" not in compressed.content


def test_never_stores_the_original_when_something_is_glued_past_its_end() -> None:
    # Every decoder stops at the marker that closes the picture and says nothing about
    # what follows, so a payload appended to a real photo decodes as that photo. It must
    # not reach `uploads` along with it.
    payload = b"<script>alert(document.cookie)</script>"
    compressed = _compress(_already_webp() + payload)

    assert payload not in compressed.content
    assert compressed.extension == ".webp"


def test_refuses_a_format_the_route_does_not_accept() -> None:
    # A TIFF under a `Content-Type: image/png`. The content type is the client's word,
    # so the decoder is where the three formats this shop takes are actually enforced —
    # the parsers for everything else are the ones that collect the CVEs.
    tiff = io.BytesIO()
    Image.new("RGB", (64, 64), (10, 20, 30)).save(tiff, "TIFF")

    with pytest.raises(UnreadableImageError):
        _compress(tiff.getvalue())


def test_refuses_an_animated_gif_rather_than_flattening_it() -> None:
    frames = [Image.new("RGB", (50, 50), (step * 40, 0, 0)) for step in range(4)]
    animated = io.BytesIO()
    frames[0].save(animated, "GIF", save_all=True, append_images=frames[1:])

    with pytest.raises(UnreadableImageError):
        _compress(animated.getvalue())


def test_turns_a_sideways_photo_that_also_has_to_be_scaled_down() -> None:
    """Rotation and scaling in one file, which is the ordinary phone photo.

    The scaling runs first, so that a 24 MP picture is never held at its own size — and
    the box being square is what makes that safe. This is the test that would fail if the
    box ever stopped being square and the two steps kept this order.
    """
    image = Image.new("RGB", (MAX_DIMENSION * 2, MAX_DIMENSION), (10, 120, 200))
    exif = image.getexif()
    exif[274] = 6
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif)

    compressed = _compress(buffer.getvalue())

    assert Image.open(io.BytesIO(compressed.content)).size == (MAX_DIMENSION // 2, MAX_DIMENSION)


def test_refuses_a_picture_with_more_pixels_than_the_ceiling() -> None:
    # Small on the wire, expensive to decode: the cost of a photo here is its pixel
    # count, not its size on the wire, and `MAX_PIXELS` is the only thing that bounds it.
    side = int(MAX_PIXELS**0.5) + 100
    oversized = io.BytesIO()
    Image.new("RGB", (side, side), (7, 7, 7)).save(oversized, "PNG")
    assert len(oversized.getvalue()) < 1024 * 1024

    with pytest.raises(ImageTooDetailedError):
        _compress(oversized.getvalue())


def test_refuses_something_that_is_not_an_image() -> None:
    with pytest.raises(UnreadableImageError):
        _compress(b"PK\x03\x04 this is a zip, whatever the content type claimed")


def test_refuses_a_truncated_image() -> None:
    truncated = _photo(600, 600)[:1024]

    with pytest.raises(UnreadableImageError):
        _compress(truncated)


def test_refuses_a_declared_size_no_machine_should_decode() -> None:
    # A decompression bomb: a few kilobytes on the wire, 12 gigabytes of RGBA once
    # decoded. The header alone has to be enough to refuse it.
    bomb = io.BytesIO()
    Image.new("L", (60000, 60000)).save(bomb, "PNG")

    with pytest.raises(ImageTooDetailedError):
        _compress(bomb.getvalue())
