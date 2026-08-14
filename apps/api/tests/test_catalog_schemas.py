import pytest
from pydantic import ValidationError

from app.catalog.schemas import (
    CategoryCreateRequest,
    ProductCreateRequest,
    ProductUpdateRequest,
)
from app.common.schemas import PageResponse


def test_category_create_accepts_valid_slug() -> None:
    request = CategoryCreateRequest(name="Skincare", slug="skincare-basics", sort_order=1)
    assert request.slug == "skincare-basics"


@pytest.mark.parametrize("slug", ["Skincare", "skin_care", "-skincare", "skincare-", "skin care"])
def test_category_create_rejects_invalid_slug(slug: str) -> None:
    with pytest.raises(ValidationError):
        CategoryCreateRequest(name="Skincare", slug=slug, sort_order=0)


def test_product_create_rejects_negative_price() -> None:
    with pytest.raises(ValidationError):
        ProductCreateRequest(name="Lipstick", slug="lipstick", brand="Round Lab", price_cents=-100)


def test_product_create_accepts_zero_price() -> None:
    request = ProductCreateRequest(name="Sample", slug="sample", brand="Round Lab", price_cents=0)
    assert request.price_cents == 0


def test_product_create_requires_a_brand() -> None:
    with pytest.raises(ValidationError):
        ProductCreateRequest.model_validate(
            {"name": "Lipstick", "slug": "lipstick", "priceCents": 1500}
        )


@pytest.mark.parametrize("brand", ["", "   ", None])
def test_product_create_rejects_a_blank_brand(brand: str | None) -> None:
    with pytest.raises(ValidationError):
        ProductCreateRequest.model_validate(
            {"name": "Lipstick", "slug": "lipstick", "priceCents": 1500, "brand": brand}
        )


def test_product_create_trims_the_brand() -> None:
    request = ProductCreateRequest(
        name="Lipstick", slug="lipstick", brand="  Round Lab  ", price_cents=1500
    )
    assert request.brand == "Round Lab"


def test_product_update_leaves_an_omitted_brand_alone() -> None:
    """PATCH without a brand touches the other fields only — it isn't a way to clear it."""
    request = ProductUpdateRequest.model_validate({"name": "Lipstick"})
    assert "brand" not in request.model_dump(exclude_unset=True)


@pytest.mark.parametrize("brand", ["", "   ", None])
def test_product_update_rejects_clearing_the_brand(brand: str | None) -> None:
    with pytest.raises(ValidationError):
        ProductUpdateRequest.model_validate({"brand": brand})


def test_camel_case_alias_accepted_on_input() -> None:
    request = ProductCreateRequest.model_validate(
        {
            "name": "Lipstick",
            "slug": "lipstick",
            "brand": "Round Lab",
            "priceCents": 1500,
            "inStock": False,
        }
    )
    assert request.price_cents == 1500
    assert request.in_stock is False


def test_page_response_serializes_camel_case() -> None:
    page = PageResponse[str](items=["a", "b"], total=2, page=1, page_size=20)
    dumped = page.model_dump(by_alias=True)
    assert dumped == {"items": ["a", "b"], "total": 2, "page": 1, "pageSize": 20}
