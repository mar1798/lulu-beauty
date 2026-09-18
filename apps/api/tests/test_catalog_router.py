import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.catalog.models import Category, Product, ProductImage
from app.catalog.results import CatalogSuggestions
from app.db import get_session
from app.main import app


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    app.dependency_overrides[get_session] = lambda: None
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _product(*, deleted_at: datetime | None = None) -> Product:
    product = Product(
        id=uuid.uuid4(),
        name="Rose Serum",
        slug="rose-serum",
        description=None,
        brand="Anua",
        price_cents=1000,
        volume_ml=30,
        category_id=None,
        in_stock=True,
        deleted_at=deleted_at,
    )
    product.images = []
    product.created_at = datetime.now(UTC)
    product.updated_at = datetime.now(UTC)
    return product


def _service(mock_service_cls: MagicMock, product: Product | None) -> MagicMock:
    service = mock_service_cls.return_value
    service.get_by_slug = AsyncMock(return_value=product)
    return service


async def test_unknown_slug_is_not_found(client: AsyncClient) -> None:
    with patch("app.catalog.router.ProductService") as mock_service_cls:
        _service(mock_service_cls, None)
        response = await client.get("/products/never-existed")

    assert response.status_code == 404
    assert response.json()["detail"] == "product_not_found"


async def test_withdrawn_product_is_gone_not_missing(client: AsyncClient) -> None:
    """A withdrawn product keeps its address; the site redirects rather than 404s.

    The distinction is the whole point of the endpoint looking past the soft-delete
    filter: the two answers lead to different pages (`docs/seo.md`).
    """
    with patch("app.catalog.router.ProductService") as mock_service_cls:
        service = _service(mock_service_cls, _product(deleted_at=datetime.now(UTC)))
        response = await client.get("/products/rose-serum")

    assert service.get_by_slug.await_args.kwargs == {"include_deleted": True}
    assert response.status_code == 410
    assert response.json()["detail"] == "product_gone"


async def test_live_product_carries_its_modification_time(client: AsyncClient) -> None:
    """`updatedAt` is what the sitemap writes as `<lastmod>` — it has to be in the payload."""
    product = _product()
    with patch("app.catalog.router.ProductService") as mock_service_cls:
        _service(mock_service_cls, product)
        response = await client.get("/products/rose-serum")

    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "rose-serum"
    # The envelope writes UTC as `Z`, `datetime.isoformat` as `+00:00` — same instant.
    assert datetime.fromisoformat(body["updatedAt"]) == product.updated_at


async def test_suggest_refuses_an_empty_query(client: AsyncClient) -> None:
    """A single letter is a question; nothing at all asks for the whole catalogue."""
    response = await client.get("/search/suggest", params={"q": ""})

    assert response.status_code == 422


async def test_suggest_answers_a_single_character(client: AsyncClient) -> None:
    with patch("app.catalog.router.ProductService") as mock_service_cls:
        mock_service_cls.return_value.suggest = AsyncMock(
            return_value=CatalogSuggestions(categories=[], brands=[], products=[])
        )

        response = await client.get("/search/suggest", params={"q": "т"})

    assert response.status_code == 200


async def test_suggest_returns_the_three_groups(client: AsyncClient) -> None:
    category = Category(id=uuid.uuid4(), name="Тонеры", slug="toners", sort_order=0)
    product = _product()
    product.images = [
        ProductImage(
            id=uuid.uuid4(),
            product_id=product.id,
            url="http://x/1.jpg",
            alt="Роза",
            sort_order=0,
            is_primary=True,
        )
    ]

    with patch("app.catalog.router.ProductService") as mock_service_cls:
        mock_service_cls.return_value.suggest = AsyncMock(
            return_value=CatalogSuggestions(
                categories=[category], brands=["Anua"], products=[product]
            )
        )

        response = await client.get("/search/suggest", params={"q": "ро"})

    assert response.status_code == 200
    assert response.json() == {
        "categories": [{"name": "Тонеры", "slug": "toners"}],
        "brands": ["Anua"],
        "products": [
            {
                "id": str(product.id),
                "name": "Rose Serum",
                "slug": "rose-serum",
                "brand": "Anua",
                "priceCents": 1000,
                "inStock": True,
                "imageUrl": "http://x/1.jpg",
                "imageAlt": "Роза",
            }
        ],
    }
