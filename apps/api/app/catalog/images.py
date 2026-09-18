from collections.abc import Sequence

from app.catalog.models import ProductImage


def primary_image(images: Sequence[ProductImage]) -> ProductImage | None:
    """A product's primary image, falling back to the first one by sort order.

    Kept free of the session so cart responses and order snapshots share one rule
    (and so it is testable without a database).
    """
    if not images:
        return None

    ordered = sorted(images, key=lambda image: image.sort_order)
    for image in ordered:
        if image.is_primary:
            return image
    return ordered[0]


def primary_image_url(images: Sequence[ProductImage]) -> str | None:
    """Just the URL — what every caller but the search dropdown needs."""
    image = primary_image(images)
    return None if image is None else image.url
