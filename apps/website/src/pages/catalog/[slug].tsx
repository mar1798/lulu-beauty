import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import type { IProduct } from 'widgets/types'
import { Text } from 'widgets/atoms'
import { Breadcrumbs } from 'widgets/molecules'
import { ProductDetails } from 'widgets/organisms'
import { ProductTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { ClosedCycleNotice } from '@/components/ClosedCycleNotice'
import { PageMeta } from '@/components/PageMeta'
import { WishlistButton } from '@/components/WishlistButton'
import { isApiError } from '@/services/apiErrors'
import { getProduct, listProducts } from '@/services/endpoints/catalog'
import { sharedActiveCycle, sharedCategories } from '@/services/staticData'
import { activeCycleFallback, type ISwrFallback } from '@/services/swrFallback'

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
    // Удалённый товар должен отдавать 404, а не 500.
    if (isApiError(error) && error.status === NOT_FOUND) {
      return { notFound: true, revalidate: REVALIDATE_SECONDS }
    }

    throw error
  }
}

/** Длина `<meta name="description">`, дальше поисковик всё равно обрезает. */
const DESCRIPTION_LIMIT = 160

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
const ProductPage: React.FC<IProductPageProps> = ({ product, categoryName }) => (
  <SiteLayout>
    <PageMeta
      title={`${product.name} — Sululu`}
      description={
        product.description == null || product.description === ''
          ? undefined
          : product.description.slice(0, DESCRIPTION_LIMIT)
      }
      path={`/catalog/${product.slug}`}
      image={previewImage(product)}
    />

    <ProductTemplate
      breadcrumbs={
        <Breadcrumbs
          items={[
            { label: 'Главная', link: { href: '/' } },
            { label: 'Каталог', link: { href: '/catalog' } },
          ]}
          current={product.name}
        />
      }
    >
      <ClosedCycleNotice />

      <ProductDetails
        product={product}
        categoryName={categoryName}
        action={
          product.inStock ? (
            <AddToCartButton productId={product.id} size="lg" />
          ) : (
            <Text tone="muted">Товара сейчас нет в наличии — загляните в следующий сбор.</Text>
          )
        }
        secondaryAction={<WishlistButton productId={product.id} withLabel={true} size="lg" />}
      />
    </ProductTemplate>
  </SiteLayout>
)

export default ProductPage
