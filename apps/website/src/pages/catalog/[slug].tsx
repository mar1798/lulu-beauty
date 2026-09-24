import React, { useState } from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import type { IProduct } from 'widgets/types'
import { Text } from 'widgets/atoms'
import { Breadcrumbs } from 'widgets/molecules'
import { ProductDetails } from 'widgets/organisms'
import { ProductTemplate } from 'widgets/templates'
import { useCart } from '@/contexts/CartContext'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { CartQuantityStepper } from '@/components/CartQuantityStepper'
import { ClosedCycleNotice } from '@/components/ClosedCycleNotice'
import { JsonLd } from '@/components/JsonLd'
import { PageMeta } from '@/components/PageMeta'
import { WishlistButton } from '@/components/WishlistButton'
import { isApiError } from '@/services/apiErrors'
import { getProduct, listProducts } from '@/services/endpoints/catalog'
import { sharedActiveCycle, sharedCategories } from '@/services/staticData'
import { activeCycleFallback, type ISwrFallback } from '@/services/swrFallback'
import { breadcrumbsLd, productLd } from '@/utils/jsonLd'
import { productDescription, productTitle } from '@/utils/seo'

/**
 * Страница товара.
 *
 * `fallback: 'blocking'`, а не `true`: холодный адрес рендерится на сервере и
 * приезжает готовым — либо товаром, либо честным 404. Каркас в HTML не
 * попадает вовсе.
 *
 * Раньше здесь стоял `fallback: true` с расчётом на то, что каркас — редкость:
 * `getStaticPaths` пререндерит весь каталог, и холодным остаётся только товар,
 * добавленный импортом после сборки. **В проде этого расчёта не существует.**
 * Образ собирается без доступа к API (так задумано, см. `apps/website/Dockerfile`),
 * `getStaticPaths` уходит в свой `catch` и отдаёт пустой список — то есть
 * холодная генерация на проде не исключение, а единственный способ, которым
 * вообще появляется страница товара.
 *
 * А на холодном пути `fallback: true` на проде **зависал**: несуществующий
 * слаг не отдавал ни 404, ни каркас — соединение висело минутами (проверено на
 * `sululu.store`, 09.2026). Краулеру, впрочем, везло: для бота Next и так
 * рендерит блокирующе, и Googlebot получал свой 404 за 0,3 с — то есть рабочим
 * на проде был ровно тот путь, на который эта страница теперь переведена
 * целиком.
 *
 * Цена — ожидание сервера у первого посетителя холодного товара (сотни
 * миллисекунд). Дальше страница живёт в кеше ISR, а протухшую версию
 * `revalidate` отдаёт сразу и обновляет в фоне.
 */

const REVALIDATE_SECONDS = 60

/** Потолок публичной ручки списка (`page_size` в `catalog/router.py`). */
const PATHS_PAGE_SIZE = 100

/**
 * Предохранитель на случай, если каталог однажды вырастет до неприличного:
 * сборка не должна упираться в бесконечную пагинацию. Остальные товары
 * соберутся по первому заходу.
 */
const MAX_PREBUILT_PAGES = 20

const NOT_FOUND = 404

/**
 * Товар снят с продажи. Отдельный код от 404 не для красоты: адрес каталогу
 * знаком, и отвечать на него «ничего нет» — значит выбросить всё, что этот
 * URL успел накопить в поиске.
 */
const GONE = 410

interface IProductPageProps {
  product: IProduct
  /** У товара приходит только `categoryId` — имя резолвится здесь, на сервере. */
  categoryName: string | null
  /** Состояние сбора для кеша SWR — см. `services/swrFallback.ts`. */
  fallback: ISwrFallback
}

/** Все slug'и каталога, страница за страницей (ручка отдаёт максимум сотню за раз). */
const collectSlugs = async (): Promise<string[]> => {
  const slugs: string[] = []

  for (let page = 1; page <= MAX_PREBUILT_PAGES; page += 1) {
    const chunk = await listProducts({ page, pageSize: PATHS_PAGE_SIZE })

    slugs.push(...chunk.items.map(product => product.slug))

    if (slugs.length >= chunk.total || chunk.items.length === 0) {
      break
    }
  }

  return slugs
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    return {
      paths: (await collectSlugs()).map(slug => ({ params: { slug } })),
      fallback: 'blocking',
    }
  } catch {
    // API недоступен на сборке — все страницы соберутся по первому обращению.
    return { paths: [], fallback: 'blocking' }
  }
}

export const getStaticProps: GetStaticProps<IProductPageProps, { slug: string }> = async ({
  params,
}) => {
  const slug = params?.slug

  if (slug === undefined) {
    return { notFound: true }
  }

  try {
    /*
      Три запроса параллельно, а не цепочкой: имя категории и состояние сбора
      не зависят от товара, а на холодном пути их последовательное ожидание
      складывалось в задержку самой генерации страницы.
    */
    const [product, categories, cycle] = await Promise.all([
      getProduct(slug),
      // Общие на всю сборку: одинаковы для всех двух тысяч карточек — см.
      // `services/staticData.ts`.
      sharedCategories().catch(() => []),
      sharedActiveCycle().catch(() => null),
    ])

    const category = categories.find(item => item.id === product.categoryId)

    return {
      props: {
        product,
        categoryName: category?.name ?? null,
        fallback: activeCycleFallback(cycle),
      },
      revalidate: REVALIDATE_SECONDS,
    }
  } catch (error) {
    /*
      Снятый товар уводит в каталог, а не упирается в 404: страница у него была,
      на неё ссылались, и обрывать эти ссылки незачем (`SEO_PLAN.md`, задача 2.4).

      Переадресация **временная**, вопреки букве плана с его 301. Снятие товара
      здесь обратимо по устройству: импорт xlsx оживляет позицию, которую встретил
      снова (`apps/api/app/catalog/import_service.py`), и админка умеет
      восстанавливать вручную. Постоянную переадресацию браузер запоминает
      надолго — вернувшийся в следующем сборе товар открывался бы каталогом у
      всех, кто застал его снятым.

      Цель у 301 в плане — категория или бренд товара. Таких маршрутов пока нет
      (фаза 3), а выбирать между `?brand=` и `?category=` не из чего: тела у 410
      нет, и это намеренно — цену и наличие снятого товара наружу отдавать
      нечего. Когда маршруты появятся, адресом станет страница категории.
    */
    if (isApiError(error) && error.status === GONE) {
      return {
        redirect: { destination: '/catalog', permanent: false },
        revalidate: REVALIDATE_SECONDS,
      }
    }

    // Слага не было вовсе — честный 404, как и раньше.
    if (isApiError(error) && error.status === NOT_FOUND) {
      return { notFound: true, revalidate: REVALIDATE_SECONDS }
    }

    throw error
  }
}

/**
 * Картинка превью — главная фотография товара, как её выбирает и карточка
 * каталога: помеченная `isPrimary`, иначе первая по порядку. Адрес берётся из
 * API как есть: там он уже абсолютный (`PUBLIC_FILES_BASE_URL`), а `og:image`
 * другого и не принимает.
 */
function previewImage(product: IProduct): { url: string; alt: string } | undefined {
  const image = product.images.find(candidate => candidate.isPrimary) ?? product.images[0]

  return image === undefined ? undefined : { url: image.url, alt: image.alt ?? product.name }
}

/*
  Пропсы всегда полные: `fallback: 'blocking'` не отдаёт кадр без данных —
  страница либо отрендерена с товаром, либо это уже 404.
*/
const ProductPage: React.FC<IProductPageProps> = ({ product, categoryName }) => {
  const path = `/catalog/${product.slug}`
  const { cart } = useCart()

  /*
    Выбранный объём. Состояние страницы, а не виджета: от него зависит и цена
    в `ProductDetails`, и то, что положит «в корзину», — держать это решение
    в двух местах значит рано или поздно разойтись.

    В состоянии лежит только явный выбор человека, а не «текущий объём»:
    выбранный вычисляется из него и товара. Поэтому сбрасывать ничего не надо
    при переходе на другой товар клиентской навигацией — чужой id просто не
    найдётся среди его объёмов, — и не нужен эффект, который на первом кадре
    показывал бы цену не того объёма.

    По умолчанию — первый объём в наличии, иначе просто первый: открывать
    страницу на кончившихся 30 мл, когда рядом есть 50, значит показывать
    товар недоступным, хотя он продаётся.
  */
  const [chosenVariantId, setChosenVariantId] = useState<string | null>(null)
  const selected =
    product.variants.find(variant => variant.id === chosenVariantId) ??
    product.variants.find(variant => variant.inStock) ??
    product.variants[0] ??
    null
  const selectedVariantId = selected?.id ?? null

  /*
    Наличие выбранного объёма. `product.inStock` — запасной ответ для товара
    без объёмов вовсе: у него самого есть и цена, и остаток.
  */
  const isAvailable = selected?.inStock ?? product.inStock

  /*
    Выбранный объём уже в заявке. Знать об этом должна страница, а не одна
    кнопка: от этого зависит вся строка действий — и кнопка, и выезжающее
    рядом количество.
  */
  const isInCart =
    selectedVariantId !== null &&
    cart?.items.some(item => item.variantId === selectedVariantId) === true

  /*
    Одна цепочка на видимые крошки и на разметку: список в `BreadcrumbList`
    обязан совпадать с нарисованным звено в звено, а два отдельных массива
    рано или поздно разъезжаются. Уровня категории тут пока нет — своей
    страницы у неё тоже нет (задача 3.1 плана).
  */
  const breadcrumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Каталог', path: '/catalog' },
    { name: product.name, path },
  ]

  return (
    <SiteLayout>
      <PageMeta
        title={productTitle(product)}
        description={productDescription(product)}
        path={path}
        image={previewImage(product)}
      />

      <JsonLd data={productLd(product, categoryName)} />
      <JsonLd data={breadcrumbsLd(breadcrumbs)} />

      <ProductTemplate
        breadcrumbs={
          <Breadcrumbs
            items={breadcrumbs.slice(0, -1).map(item => ({
              label: item.name,
              link: { href: item.path },
            }))}
            current={product.name}
          />
        }
      >
        <ClosedCycleNotice />

        <ProductDetails
          product={product}
          categoryName={categoryName}
          selectedVariantId={selectedVariantId}
          onSelectVariant={setChosenVariantId}
          /*
            Объём в корзине — не товар: у товара с несколькими объёмами один
            может лежать в заявке, а показанный сейчас — нет, и строка
            действий обязана говорить про выбранный.
          */
          isInCart={isInCart}
          quantity={
            <CartQuantityStepper variantId={selectedVariantId} productName={product.name} />
          }
          action={
            /*
              Наличие — свойство выбранного объёма, а не товара: у товара
              `inStock` значит «хоть один объём есть», и на кончившихся 30 мл
              кнопка обещала бы то, чего сейчас не купить.

              Кнопка при этом остаётся на месте погашенной, а не подменяется
              текстом: переключатель объёма выше даёт выбрать и кончившийся
              размер, и человек должен видеть, что именно поменялось от его
              выбора, — а исчезающее и возвращающееся действие читается как
              сломавшаяся страница.
            */
            <AddToCartButton
              product={product}
              variantId={selectedVariantId}
              size="lg"
              /*
                Во всю ширину слота: на узком экране кнопка занимает строку за
                вычетом сердца, на десктопе слот сам сжат по содержимому.
              */
              isFullWidth={true}
              disabled={!isAvailable}
            />
          }
          secondaryAction={
            <WishlistButton
              productId={product.id}
              productName={product.name}
              withTooltip={true}
              size="lg"
            />
          }
          note={
            /*
              Не «нет в наличии», а «нет в сборе»: товар не кончился на складе,
              его просто нет в текущем заказе — так устроен магазин, и человеку
              честнее сказать это словами модели.

              Вторая фраза — не обещание, а описание того, что и так работает:
              открытие сбора бот объявляет всем, кто с ним связан
              (`notify_cycle_opened`), а избранное к этому моменту ждёт рядом.
              Отдельной кнопки «сообщить, когда появится» из плана нет
              намеренно: подписки на товар в бэкенде не существует, и рисовать
              кнопку под несуществующее уведомление — врать интерфейсом.
            */
            isAvailable ? undefined : (
              <Text tone="muted" size="sm">
                Сейчас товара нет в сборе. Добавьте в избранное - бот напишет, когда откроется
                следующий.
              </Text>
            )
          }
        />
      </ProductTemplate>
    </SiteLayout>
  )
}

export default ProductPage
