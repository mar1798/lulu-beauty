from app.catalog.images import primary_image_url, variant_image_url
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


def _tagged(
    url: str,
    *,
    sort_order: int = 0,
    volumes_ml: list[int] | None = None,
    shades: list[str] | None = None,
) -> ProductImage:
    image = _image(url, sort_order=sort_order, is_primary=sort_order == 0)
    image.volumes_ml = volumes_ml or []
    image.shades = shades or []
    return image


def test_a_photo_of_two_shades_shows_either() -> None:
    images = [
        _tagged("all.jpg"),
        _tagged("pair.jpg", sort_order=1, shades=["01 Nude", "05 Rose"]),
        _tagged("berry.jpg", sort_order=2, shades=["12 Berry"]),
    ]

    assert variant_image_url(images, None, "05 rose") == "pair.jpg"
    assert variant_image_url(images, None, "01 Nude") == "pair.jpg"
    assert variant_image_url(images, None, "12 Berry") == "berry.jpg"


def test_volumes_and_shades_both_have_to_fit() -> None:
    images = [
        _tagged("all.jpg"),
        _tagged("big-rose.jpg", sort_order=1, volumes_ml=[50, 100], shades=["05 Rose"]),
        _tagged("rose.jpg", sort_order=2, shades=["05 Rose"]),
    ]

    assert variant_image_url(images, 100, "05 Rose") == "big-rose.jpg"
    assert variant_image_url(images, 30, "05 Rose") == "rose.jpg"
    assert variant_image_url(images, 30, "01 Nude") == "all.jpg"


def test_a_photo_built_in_memory_counts_as_untagged() -> None:
    # The column default only arrives on INSERT; until then the lists are None.
    assert variant_image_url([_image("only.jpg")], 30, "05 Rose") == "only.jpg"


def test_a_hidden_photo_is_never_picked() -> None:
    hidden = _tagged("hidden.jpg", shades=["05 Rose"])
    hidden.hidden = True
    images = [hidden, _tagged("rest.jpg", sort_order=1)]

    # Not as the variant's photo, and not as the product's own either, though it is first.
    assert variant_image_url(images, None, "05 Rose") == "rest.jpg"
    assert primary_image_url(images) == "rest.jpg"
    assert primary_image_url([hidden]) is None
