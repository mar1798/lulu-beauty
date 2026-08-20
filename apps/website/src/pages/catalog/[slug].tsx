import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { GetStaticPaths, GetStaticProps } from 'next'
import type { IProduct } from 'widgets/types'
import { Text } from 'widgets/atoms'
import { Breadcrumbs } from 'widgets/molecules'
import { ProductDetails, ProductDetailsSkeleton } from 'widgets/organisms'
import { ProductTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { ClosedCycleNotice } from '@/components/ClosedCycleNotice'
import { WishlistButton } from '@/components/WishlistButton'
import { isApiError } from '@/services/apiErrors'
import { getProduct, listProducts } from '@/services/endpoints/catalog'
import { sharedActiveCycle, sharedCategories } from '@/services/staticData'
import { activeCycleFallback, type ISwrFallback } from '@/services/swrFallback'

/**
 * Страница товара.
 *
 * `fallback: true`, а не `'blocking'`: переход должен открывать страницу
 * сразу, а не держать покупателя на каталоге, пока сервер ходит за товаром.
 * Пока данных нет, на месте карточки стоит каркас той же раскладки, поэтому
 * подстановка товара ничего не двигает.
 *
 * Чтобы поисковик почти никогда не попадал на этот каркас, на сборке
 * пререндерится весь каталог (см. `getStaticPaths`): холодным остаётся только
 * товар, добавленный импортом уже после сборки, — и тот перестаёт быть
 * холодным после первого же захода, когда ISR его сгенерирует.
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
      fallback: true,
    }
  } catch {
    // API недоступен на сборке — все страницы соберутся по первому обращению.
    return { paths: [], fallback: true }
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

/*
  Пропсы неполные не по недосмотру: при `fallback: true` первый рендер
  приходит вообще без них — товар доезжает следующим кадром.
*/
const ProductPage: React.FC<Partial<IProductPageProps>> = ({ product, categoryName = null }) => {
  const router = useRouter()

  // `isFallback` снимается вместе с приездом пропсов, но проверяем и товар:
  // при переходе с прогретого маршрута каркаса не будет вовсе.
  const isPending = router.isFallback || product === undefined

  return (
    <SiteLayout>
      <Head>
        <title>{isPending ? 'Товар — Lulu Beauty' : `${product.name} — Lulu Beauty`}</title>
        {product?.description != null && product.description !== '' && (
          <meta name="description" content={product.description.slice(0, DESCRIPTION_LIMIT)} />
        )}
      </Head>

      <ProductTemplate
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: 'Главная', link: { href: '/' } },
              { label: 'Каталог', link: { href: '/catalog' } },
            ]}
            /*
              Пока имени нет — нейтральное «Товар», а не пустая строка:
              последняя крошка не оформляется ссылкой, и пустой она оставила
              бы висеть разделитель в конце цепочки.
            */
            current={product?.name ?? 'Товар'}
          />
        }
      >
        <ClosedCycleNotice />

        {isPending ? (
          <ProductDetailsSkeleton />
        ) : (
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
        )}
      </ProductTemplate>
    </SiteLayout>
  )
}

export default ProductPage
