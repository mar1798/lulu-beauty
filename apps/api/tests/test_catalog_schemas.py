import pytest
from pydantic import ValidationError

from app.catalog.schemas import (
    CategoryCreateRequest,
    ProductCreateRequest,
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
        ProductCreateRequest(name="Lipstick", slug="lipstick", price_cents=-100)


def test_product_create_accepts_zero_price() -> None:
    request = ProductCreateRequest(name="Sample", slug="sample", price_cents=0)
    assert request.price_cents == 0


def test_camel_case_alias_accepted_on_input() -> None:
    request = ProductCreateRequest.model_validate(
        {"name": "Lipstick", "slug": "lipstick", "priceCents": 1500, "inStock": False}
    )
    assert request.price_cents == 1500
    assert request.in_stock is False


def test_page_response_serializes_camel_case() -> None:
    page = PageResponse[str](items=["a", "b"], total=2, page=1, page_size=20)
    dumped = page.model_dump(by_alias=True)
    assert dumped == {"items": ["a", "b"], "total": 2, "page": 1, "pageSize": 20}
