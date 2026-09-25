import pytest

from app.catalog.rich_text import clean_html, description_from_html, html_to_text


def test_clean_keeps_what_the_editor_produces() -> None:
    html = (
        "<h2>Как применять</h2>"
        "<p>Нанесите <strong>утром</strong> и <em>вечером</em>.<br>После тоника.</p>"
        "<ul><li>Увлажняет</li><li>Успокаивает</li></ul>"
        "<ol><li>Раз</li></ol>"
    )

    assert clean_html(html) == html


@pytest.mark.parametrize(
    ("dirty", "clean"),
    [
        ("<p>Текст<script>alert(1)</script></p>", "<p>Текст</p>"),
        ('<p onclick="alert(1)">Текст</p>', "<p>Текст</p>"),
        ('<p style="color:red">Текст</p>', "<p>Текст</p>"),
        ("<h1>Заголовок</h1>", "Заголовок"),
        ('<img src="x" onerror="alert(1)">', ""),
        ("<iframe src='https://example.com'></iframe>", ""),
        ("<p><u>подчёркнуто</u></p>", "<p>подчёркнуто</p>"),
    ],
)
def test_clean_removes_everything_outside_the_editor(dirty: str, clean: str) -> None:
    assert clean_html(dirty) == clean


def test_clean_marks_a_link_nofollow_and_keeps_only_its_address() -> None:
    cleaned = clean_html('<a href="https://example.com" target="_blank" class="x">сайт</a>')

    assert cleaned == '<a href="https://example.com" rel="noopener noreferrer nofollow">сайт</a>'


@pytest.mark.parametrize("href", ["javascript:alert(1)", "data:text/html,<b>x</b>"])
def test_clean_drops_a_link_to_anything_but_the_web(href: str) -> None:
    assert "href" not in clean_html(f'<a href="{href}">ссылка</a>')


def test_text_puts_each_block_on_its_own_line() -> None:
    html = (
        "<h2>Как применять</h2>"
        "<p>Нанесите  утром.<br>После тоника.</p>"
        "<ul><li>Увлажняет</li><li>Успокаивает</li></ul>"
    )

    assert html_to_text(html) == (
        "Как применять\nНанесите утром.\nПосле тоника.\nУвлажняет\nУспокаивает"
    )


def test_text_decodes_entities() -> None:
    assert html_to_text("<p>Крем &amp; тоник &lt;3</p>") == "Крем & тоник <3"


@pytest.mark.parametrize("html", ["<p></p>", "<p> </p>", "<p><br></p>", "<script>x</script>"])
def test_an_empty_editor_is_no_description(html: str) -> None:
    rich = description_from_html(html)

    assert (rich.html, rich.text) == (None, None)


def test_description_from_html_stores_the_cleaned_html_and_its_text() -> None:
    rich = description_from_html("<p onclick='x'>Мягкий <b>тоник</b></p>")

    assert rich.html == "<p>Мягкий тоник</p>"
    assert rich.text == "Мягкий тоник"
