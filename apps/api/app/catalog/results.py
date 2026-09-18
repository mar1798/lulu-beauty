"""Shapes a catalog service returns that are neither a model nor a response.

Kept out of `service.py` so that `serializers.py` can name them without importing the
service: serializers sit between the models and the schemas, and a serializer that
depends on a service is the wrong way round — and one import away from a cycle the
moment a service wants to serialize something.
"""

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
