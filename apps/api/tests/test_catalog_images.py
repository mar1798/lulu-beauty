from app.catalog.images import primary_image_url
from app.catalog.models import ProductImage


def _image(url: str, *, sort_order: int = 0, is_primary: bool = False) -> ProductImage:
    return ProductImage(url=url, alt=None, sort_order=sort_order, is_primary=is_primary)


def test_returns_none_without_images() -> None:
    assert primary_image_url([]) is None


def test_prefers_the_primary_image_over_sort_order() -> None:
    images = [
        _image("first.jpg", sort_order=0),
        _image("primary.jpg", sort_order=5, is_primary=True),
    ]
    assert primary_image_url(images) == "primary.jpg"


def test_falls_back_to_lowest_sort_order_when_no_primary() -> None:
    images = [_image("second.jpg", sort_order=2), _image("first.jpg", sort_order=1)]
    assert primary_image_url(images) == "first.jpg"
