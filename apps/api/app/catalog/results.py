"""Shapes a catalog service returns that are neither a model nor a response.

Kept out of `service.py` so that `serializers.py` can name them without importing the
service: serializers sit between the models and the schemas, and a serializer that
depends on a service is the wrong way round — and one import away from a cycle the
moment a service wants to serialize something.
"""

import uuid
from dataclasses import dataclass

from app.catalog.models import Category, Product


@dataclass(frozen=True)
class CatalogSuggestions:
    """What the header search offers for one query, grouped by what it is.

    Three groups rather than one list because they lead to three different places: a
    category and a brand open a filtered catalog, a product opens its own page.
    """

    categories: list[Category]
    brands: list[str]
    products: list[Product]


@dataclass(frozen=True)
class VariantSpec:
    """One line of the owner's variants table, on its way into the catalog.

    The (volume, shade) pair is the identity: reconciling a product's variants against a
    list of these matches by it, so editing a price keeps the variant row — and with it
    every cart line and every pending order that points at it — instead of replacing it.

    `id` is the row the line was loaded from, when the form knows it. It is what lets a
    corrected shade name ("Rosee" → "Rose") stay the same variant: matched by name alone,
    a rename is a withdrawal and a new arrival, and the withdrawal takes the shade out of
    every cart and pending order.
    """

    volume_ml: int | None
    price_cents: int
    in_stock: bool
    shade: str | None = None
    id: uuid.UUID | None = None


@dataclass(frozen=True)
class ImageArrangement:
    """One photo of the gallery as the owner left it: its place is its index in the list."""

    id: uuid.UUID
    # The variants it shows — see `ProductImage.volumes_ml`; empty is "any".
    volumes_ml: tuple[int, ...] = ()
    shades: tuple[str, ...] = ()
    # Shown for no variant — see `ProductImage.hidden`; the lists are ignored then.
    hidden: bool = False
    # The alt text, applied only when `alt_given`: a client that does not send one keeps
    # what the photo has, while `None` with `alt_given` clears it.
    alt: str | None = None
    alt_given: bool = False
