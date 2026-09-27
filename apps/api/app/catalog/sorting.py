"""The orders a product listing can be read in.

Two vocabularies over one mechanism. The storefront offers a buyer three finished
choices (`CatalogSort`) — "newest", "cheapest first", "dearest first" — because a
direction on its own means nothing there: nobody asks for the oldest products first.
The admin table sorts by clicking a column header, so it sends a column and a
direction separately (`SortField` + `SortDirection`). Both come down to the same
`ProductOrder`, and only that reaches the query.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.catalog.models import Product


class SortField(StrEnum):
    NAME = "name"
    PRICE = "price"
    CREATED = "created"


class SortDirection(StrEnum):
    ASC = "asc"
    DESC = "desc"


class CatalogSort(StrEnum):
    NEW = "new"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"


@dataclass(frozen=True)
class ProductOrder:
    field: SortField
    direction: SortDirection

    def clauses(self) -> list[Any]:
        """The ORDER BY for this order, always ending on a unique column.

        Nothing sorted on here is unique — two volumes of one toner share a name, half
        a shelf shares a price, and an xlsx import writes every new row in one
        transaction, so they all get the same `created_at` (`now()` is the start of the
        transaction). Ties left to the planner make a paginated listing repeat one
        product on page two and skip another, so the name breaks them where it is not
        already the key, and the id breaks whatever the name does not.
        """
        column = {
            SortField.NAME: Product.name,
            SortField.PRICE: Product.price_cents,
            SortField.CREATED: Product.created_at,
        }[self.field]
        primary = column.desc() if self.direction is SortDirection.DESC else column.asc()
        if self.field is SortField.NAME:
            return [primary, Product.id]
        return [primary, Product.name, Product.id]


# What a listing is read in when the caller names no order: newest first, on the
# storefront and in the admin table alike, so the owner sees the list the buyers see.
DEFAULT_ORDER = ProductOrder(SortField.CREATED, SortDirection.DESC)

CATALOG_ORDERS: dict[CatalogSort, ProductOrder] = {
    CatalogSort.NEW: DEFAULT_ORDER,
    CatalogSort.PRICE_ASC: ProductOrder(SortField.PRICE, SortDirection.ASC),
    CatalogSort.PRICE_DESC: ProductOrder(SortField.PRICE, SortDirection.DESC),
}
