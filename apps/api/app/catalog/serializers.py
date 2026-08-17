"""Model → response mapping for catalog entities.

Lives outside the router because it is not the router's alone: the wishlist returns
whole products, and a second hand-written copy of this mapping is exactly how a field
added to ProductResponse ends up populated on one endpoint and missing on the other.
"""

from app.catalog.models import Category, Product
from app.catalog.schemas import CategoryResponse, ProductImageResponse, ProductResponse


def category_response(category: Category) -> CategoryResponse:
    return CategoryResponse(
        id=category.id, name=category.name, slug=category.slug, sort_order=category.sort_order
    )


def product_response(product: Product) -> ProductResponse:
    return ProductResponse(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        brand=product.brand,
        price_cents=product.price_cents,
        volume_ml=product.volume_ml,
        category_id=product.category_id,
        in_stock=product.in_stock,
        deleted_at=product.deleted_at,
        images=[
            ProductImageResponse(
                id=image.id,
                url=image.url,
                alt=image.alt,
                sort_order=image.sort_order,
                is_primary=image.is_primary,
            )
            for image in product.images
        ],
    )
