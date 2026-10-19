"""Model → response mapping for catalog entities.

Lives outside the router because it is not the router's alone: the wishlist returns
whole products, and a second hand-written copy of this mapping is exactly how a field
added to ProductResponse ends up populated on one endpoint and missing on the other.
"""

from app.catalog.images import primary_image
from app.catalog.models import Category, Product, ProductImage
from app.catalog.results import CatalogSuggestions
from app.catalog.schemas import (
    CategoryResponse,
    ProductImageResponse,
    ProductResponse,
    ProductVariantResponse,
    SearchSuggestResponse,
    SuggestCategoryResponse,
    SuggestProductResponse,
)


def category_response(category: Category) -> CategoryResponse:
    return CategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        sort_order=category.sort_order,
        parent_id=category.parent_id,
    )


def image_response(image: ProductImage) -> ProductImageResponse:
    return ProductImageResponse(
        id=image.id,
        url=image.url,
        alt=image.alt,
        sort_order=image.sort_order,
        is_primary=image.is_primary,
        volumes_ml=list(image.volumes_ml or []),
        shades=list(image.shades or []),
        hidden=image.hidden,
    )


def product_response(product: Product, *, include_hidden: bool = False) -> ProductResponse:
    """The product as an endpoint returns it.

    Hidden photos (`ProductImage.hidden`) only with `include_hidden`, which is for the
    admin endpoints: the storefront never sees them, and the first photo it does see is
    its primary one, whatever place the hidden ones take in the gallery.
    """
    if include_hidden:
        images = [image_response(image) for image in product.images]
    else:
        primary = primary_image(product.images)
        images = [
            image_response(image).model_copy(update={"is_primary": image is primary})
            for image in product.images
            if not image.hidden
        ]
    return ProductResponse(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        description_html=product.description_html,
        brand=product.brand,
        price_cents=product.price_cents,
        volume_ml=product.volume_ml,
        category_id=product.category_id,
        in_stock=product.in_stock,
        is_featured=product.is_featured,
        shade_label=product.shade_label,
        # Only the live ones: a withdrawn volume still has a row (orders quote it), but
        # it is not something the storefront may offer or the admin form may show back.
        variants=[
            ProductVariantResponse(
                id=variant.id,
                volume_ml=variant.volume_ml,
                shade=variant.shade,
                price_cents=variant.price_cents,
                in_stock=variant.in_stock,
            )
            for variant in product.live_variants
        ],
        deleted_at=product.deleted_at,
        created_at=product.created_at,
        updated_at=product.updated_at,
        images=images,
    )


def suggest_response(suggestions: CatalogSuggestions) -> SearchSuggestResponse:
    return SearchSuggestResponse(
        categories=[
            SuggestCategoryResponse(name=category.name, slug=category.slug)
            for category in suggestions.categories
        ],
        brands=suggestions.brands,
        products=[
            SuggestProductResponse(
                id=product.id,
                name=product.name,
                slug=product.slug,
                brand=product.brand,
                price_cents=product.price_cents,
                variant_count=len(product.live_variants),
                price_varies=len({variant.price_cents for variant in product.live_variants}) > 1,
                in_stock=product.in_stock,
                image_url=None if (image := primary_image(product.images)) is None else image.url,
                image_alt=None if image is None else image.alt,
            )
            for product in suggestions.products
        ],
    )
