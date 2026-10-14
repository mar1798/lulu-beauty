from collections.abc import Sequence

from app.catalog.models import ProductImage
from app.catalog.shades import shade_key


def shown_images(images: Sequence[ProductImage]) -> list[ProductImage]:
    """The photos the storefront may show — every one the owner has not hidden."""
    return [image for image in images if not image.hidden]


def primary_image(images: Sequence[ProductImage]) -> ProductImage | None:
    """A product's primary image, falling back to the first one by sort order.

    Hidden photos (`ProductImage.hidden`) are passed over, the primary one included: the
    next shown photo stands in for it. Kept free of the session so cart responses and
    order snapshots share one rule (and so it is testable without a database).
    """
    shown = shown_images(images)
    if not shown:
        return None

    ordered = sorted(shown, key=lambda image: image.sort_order)
    for image in ordered:
        if image.is_primary:
            return image
    return ordered[0]


def primary_image_url(images: Sequence[ProductImage]) -> str | None:
    """Just the URL — what every caller but the search dropdown needs."""
    image = primary_image(images)
    return None if image is None else image.url


def image_shade_keys(image: ProductImage) -> set[str]:
    """The shades a photo is tagged with, compared the way variants are (`shade_key`).

    `or []`: a photo built in memory has no tags until it is flushed — the column default
    is applied on INSERT.
    """
    return {key for key in map(shade_key, image.shades or []) if key is not None}


def image_fits(image: ProductImage, volume_ml: int | None, shade: str | None) -> bool:
    """Whether a photo shows this variant: each of its tag lists names it, or is empty."""
    volumes = image.volumes_ml or []
    keys = image_shade_keys(image)
    return (not volumes or volume_ml in volumes) and (not keys or shade_key(shade) in keys)


def variant_image(
    images: Sequence[ProductImage], volume_ml: int | None, shade: str | None
) -> ProductImage | None:
    """The photo that shows this variant best, falling back to the product's own.

    A photo tagged with volumes or shades shows only the variants that have one of them
    (an empty list is "any"), and among the photos that fit, the most specific wins: one
    tagged with shades and volumes, then one with shades, then one with volumes. A shade
    is ranked over a volume because it is what a lipstick photo is *of* — 30 ml and 50 ml
    of one cream look alike, "01 Nude" and "12 Berry" do not. How many shades a photo
    names does not count: a shot of two tubes is as much this shade's as a shot of one.
    Ties go to the primary photo, then to the gallery order, and with nothing fitting at
    all, the primary photo stands in. A hidden photo fits nothing.

    The same rule as `imagesForVariant` in `packages/widgets/src/utils/variants.ts`,
    which orders the product page's gallery — keep them in step.
    """
    best: ProductImage | None = None
    # Below zero, so an untagged photo — score 0 — still counts as fitting, ahead of the
    # primary photo when that one is tagged with another shade.
    best_score = -1
    # The primary photo first among equals, then the gallery order — so an untagged
    # gallery answers exactly what `primary_image` does.
    for image in sorted(
        shown_images(images), key=lambda candidate: (not candidate.is_primary, candidate.sort_order)
    ):
        if not image_fits(image, volume_ml, shade):
            continue
        score = (2 if image_shade_keys(image) else 0) + (1 if image.volumes_ml else 0)
        if score > best_score:
            best, best_score = image, score
    return best if best is not None else primary_image(images)


def variant_image_url(
    images: Sequence[ProductImage], volume_ml: int | None, shade: str | None
) -> str | None:
    image = variant_image(images, volume_ml, shade)
    return None if image is None else image.url
