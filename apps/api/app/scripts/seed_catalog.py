"""Fills the catalog with generated demo products (development only).

Idempotent by slug: categories and products that already exist are left untouched, so
re-running only tops the catalog up. Nothing is ever deleted or overwritten.

Run with: uv run python -m app.scripts.seed_catalog [count]
"""

import asyncio
import random
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category, Product
from app.db import async_session

DEFAULT_COUNT = 50
RANDOM_SEED = 20260813

# Categories the generated products are spread over. `slug` is the identity here —
# a category with the same slug is reused instead of being created twice.
CATEGORIES: list[tuple[str, str, int]] = [
    ("Уход за кожей", "ukhod-za-kozhei", 0),
    ("Уход за волосами", "ukhod-za-volosami", 1),
    ("Уход за телом", "ukhod-za-telom", 2),
    ("Макияж", "makiyazh", 3),
    ("Парфюмерия", "parfyumeriya", 4),
]

# Product type -> (slug stem, category slug, modifier family, price range in rubles).
# The modifier family is what keeps the generated names sensible: a mascara gets a finish,
# not a serum active, and a perfume gets scent notes.
PRODUCT_TYPES: list[tuple[str, str, str, str, tuple[int, int]]] = [
    ("Сыворотка", "syvorotka", "ukhod-za-kozhei", "skin", (1200, 4500)),
    ("Крем для лица", "krem-dlya-litsa", "ukhod-za-kozhei", "skin", (900, 3800)),
    ("Тоник для лица", "tonik-dlya-litsa", "ukhod-za-kozhei", "skin", (600, 2200)),
    ("Гель для умывания", "gel-dlya-umyvaniya", "ukhod-za-kozhei", "skin", (500, 1900)),
    ("Пенка для умывания", "penka-dlya-umyvaniya", "ukhod-za-kozhei", "skin", (500, 1800)),
    ("Патчи для глаз", "patchi-dlya-glaz", "ukhod-za-kozhei", "skin", (700, 2600)),
    ("Ночная маска для лица", "nochnaya-maska-dlya-litsa", "ukhod-za-kozhei", "skin", (1100, 3600)),
    ("Шампунь", "shampun", "ukhod-za-volosami", "hair", (600, 2400)),
    ("Кондиционер для волос", "konditsioner-dlya-volos", "ukhod-za-volosami", "hair", (700, 2500)),
    ("Маска для волос", "maska-dlya-volos", "ukhod-za-volosami", "hair", (800, 3000)),
    ("Спрей для волос", "sprey-dlya-volos", "ukhod-za-volosami", "hair", (600, 2100)),
    ("Масло для кончиков волос", "maslo-dlya-konchikov", "ukhod-za-volosami", "hair", (700, 2700)),
    ("Скраб для тела", "skrab-dlya-tela", "ukhod-za-telom", "body", (700, 2400)),
    ("Масло для тела", "maslo-dlya-tela", "ukhod-za-telom", "body", (900, 3200)),
    ("Крем для рук", "krem-dlya-ruk", "ukhod-za-telom", "body", (400, 1600)),
    ("Бальзам для губ", "balzam-dlya-gub", "ukhod-za-telom", "body", (300, 1200)),
    ("Гель для душа", "gel-dlya-dusha", "ukhod-za-telom", "body", (400, 1700)),
    ("Тушь для ресниц", "tush-dlya-resnits", "makiyazh", "makeup", (800, 2800)),
    ("Помада", "pomada", "makiyazh", "makeup", (700, 2600)),
    ("Тональный крем", "tonalnyy-krem", "makiyazh", "makeup", (1200, 4200)),
    ("Пудра", "pudra", "makiyazh", "makeup", (900, 3400)),
    ("Румяна", "rumyana", "makiyazh", "makeup", (800, 3000)),
    ("Парфюмерная вода", "parfyumernaya-voda", "parfyumeriya", "scent", (2500, 9900)),
    ("Туалетная вода", "tualetnaya-voda", "parfyumeriya", "scent", (1500, 6500)),
    ("Спрей для тела", "sprey-dlya-tela", "parfyumeriya", "scent", (900, 3200)),
]

# Modifier family -> list of (modifier, slug stem, description fragment).
MODIFIERS: dict[str, list[tuple[str, str, str]]] = {
    "skin": [
        ("с гиалуроновой кислотой", "gialuron", "интенсивно увлажняет и удерживает влагу в коже"),
        ("с ниацинамидом", "niatsinamid", "выравнивает тон и сужает поры"),
        ("с коллагеном", "kollagen", "возвращает упругость и мягкость"),
        ("с алоэ вера", "aloe", "успокаивает и снимает раздражение"),
        ("с зелёным чаем", "zelenyy-chay", "освежает и защищает от свободных радикалов"),
        ("с центеллой", "tsentella", "восстанавливает чувствительную кожу"),
        ("с ретинолом", "retinol", "разглаживает мелкие морщинки"),
        ("с пантенолом", "pantenol", "смягчает и восстанавливает"),
        ("с витамином C", "vitamin-c", "придаёт коже сияние и выравнивает тон"),
        ("с экстрактом ромашки", "romashka", "бережно ухаживает каждый день"),
    ],
    "hair": [
        ("с кератином", "keratin", "укрепляет и разглаживает по всей длине"),
        ("с аргановым маслом", "argana", "придаёт мягкость и блеск"),
        ("с биотином", "biotin", "укрепляет корни и уменьшает ломкость"),
        ("с кокосовым маслом", "kokos", "питает сухие и повреждённые волосы"),
        ("с репейным маслом", "repeynik", "восстанавливает после окрашивания"),
        ("с пантенолом", "pantenol", "увлажняет и снимает пушистость"),
    ],
    "body": [
        ("с маслом ши", "maslo-shi", "питает и не оставляет липкости"),
        ("с миндальным маслом", "mindal", "мягко ухаживает за сухой кожей"),
        ("с витамином E", "vitamin-e", "питает и защищает от сухости"),
        ("с кокосовым молочком", "kokosovoe-molochko", "смягчает и приятно пахнет"),
        ("с морской солью", "morskaya-sol", "деликатно обновляет кожу"),
        ("с экстрактом алоэ", "aloe", "успокаивает после душа и бритья"),
    ],
    "makeup": [
        ("с матовым финишем", "mat", "держится весь день без скатывания"),
        ("с сияющим финишем", "siyanie", "даёт мягкое естественное сияние"),
        ("с бархатной текстурой", "barkhat", "ложится ровно и не подчёркивает сухость"),
        ("с плотным покрытием", "plotnoe-pokrytie", "перекрывает несовершенства с первого слоя"),
        ("с лёгким покрытием", "legkoe-pokrytie", "выглядит естественно и не утяжеляет"),
        ("со стойкой формулой", "stoykiy", "не требует обновления в течение дня"),
    ],
    "scent": [
        ("с нотами жасмина", "zhasmin", "мягкий цветочный шлейф на весь день"),
        ("с нотами бергамота", "bergamot", "свежее цитрусовое звучание"),
        ("с нотами ванили", "vanil", "тёплый сладковатый аромат"),
        ("с нотами сандала", "sandal", "глубокий древесный аромат"),
        ("с нотами белого мускуса", "musk", "чистое и ненавязчивое звучание"),
        ("с нотами пиона", "pion", "нежный весенний аромат"),
    ],
}

BRANDS = ["Lumen", "Bloom", "Aurea", "Nordis", "Velmi", "Sakura Lab", "Botanica", "Mira"]

VOLUMES = ["30 мл", "50 мл", "100 мл", "150 мл", "200 мл", "250 мл"]


async def _ensure_categories(session: AsyncSession) -> dict[str, Category]:
    """Creates the missing demo categories and returns every category by slug."""
    result = await session.execute(select(Category))
    by_slug = {category.slug: category for category in result.scalars()}

    for name, slug, sort_order in CATEGORIES:
        if slug in by_slug:
            continue
        category = Category(name=name, slug=slug, sort_order=sort_order)
        session.add(category)
        by_slug[slug] = category

    await session.flush()
    return by_slug


async def seed_catalog(count: int = DEFAULT_COUNT) -> None:
    rng = random.Random(RANDOM_SEED)

    async with async_session() as session:
        categories = await _ensure_categories(session)

        result = await session.execute(select(Product.slug))
        taken_slugs = set(result.scalars())

        # Every type x modifier pair within the type's own family is a unique product;
        # shuffling keeps the categories mixed instead of filling them one at a time.
        combinations = [
            (product_type, modifier)
            for product_type in PRODUCT_TYPES
            for modifier in MODIFIERS[product_type[3]]
        ]
        rng.shuffle(combinations)

        created = 0
        for (name, type_stem, category_slug, _family, price_range), (
            modifier,
            modifier_stem,
            effect,
        ) in combinations:
            if created >= count:
                break

            slug = f"{type_stem}-{modifier_stem}"
            if slug in taken_slugs:
                continue
            taken_slugs.add(slug)

            min_price, max_price = price_range
            price_rubles = rng.randrange(min_price, max_price + 1, 10)
            volume = rng.choice(VOLUMES)

            session.add(
                Product(
                    name=f"{name} {modifier}",
                    slug=slug,
                    description=f"{name} {modifier}: {effect}. Объём — {volume}.",
                    brand=rng.choice(BRANDS),
                    price_cents=price_rubles * 100,
                    category_id=categories[category_slug].id,
                    # A little out-of-stock noise so the catalog filters have something to do.
                    in_stock=rng.random() > 0.15,
                )
            )
            created += 1

        await session.commit()

    print(f"Создано товаров: {created}")


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_COUNT
    asyncio.run(seed_catalog(count))


if __name__ == "__main__":
    main()
