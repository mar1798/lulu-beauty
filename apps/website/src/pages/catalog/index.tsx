import React, { useCallback, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import type { GetStaticProps } from 'next'
import type { ICategory, IPage, IProduct } from 'widgets/types'
import { Alert, Button } from 'widgets/atoms'
import { useDebouncedValue } from 'widgets/hooks'
import { CategoryFilter, EmptyState, Pagination, SearchField } from 'widgets/molecules'
import { ProductGrid } from 'widgets/organisms'
import { CatalogTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { isApiError } from '@/services/apiErrors'
import { listCategories, listProducts } from '@/services/endpoints/catalog'

/**
 * Витрина.
 *
 * Первая страница каталога приезжает статикой (SSG + ISR), поэтому пустой
 * каталог никогда не «мигает» спиннером. Категория и номер страницы живут в
 * query-параметрах — ссылку можно переслать; поиск оставлен в состоянии
 * компонента: он меняется на каждый символ и засорял бы историю браузера.
 *
 * `getStaticProps` не имеет доступа к query-параметрам, поэтому любой вид,
 * отличный от первой страницы без фильтров, догружается на клиенте — через
 * `useSWR`: он кеширует уже увиденные страницы/категории по ключу, так что
 * возврат к ним не мигает скелетоном, а первый показ дефолтного вида
 * подхватывает статику через `fallbackData` вместо повторного запроса.
 */

const PAGE_SIZE = 24

/** Каталог меняется импортом xlsx, минута устаревания приемлема. */
const REVALIDATE_SECONDS = 60

interface ICatalogPageProps {
  categories: ICategory[]
  /** `null` — API был недоступен на сборке; страница переживает это молча. */
  initial: IPage<IProduct> | null
}

export const getStaticProps: GetStaticProps<ICatalogPageProps> = async () => {
  try {
    const [categories, initial] = await Promise.all([
      listCategories(),
      listProducts({ pageSize: PAGE_SIZE }),
    ])

    return { props: { categories, initial }, revalidate: REVALIDATE_SECONDS }
  } catch {
    // Ронять `next build` из-за недоступного API нельзя — ISR подхватит позже.
    return { props: { categories: [], initial: null }, revalidate: REVALIDATE_SECONDS }
  }
}

const firstQueryValue = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

type ICatalogKey = readonly [tag: 'catalog-products', category: string | null, q: string, page: number]

const fetchCatalogPage = async ([, category, q, page]: ICatalogKey): Promise<IPage<IProduct>> =>
  listProducts({
    category: category ?? undefined,
    q: q === '' ? undefined : q,
    page,
    pageSize: PAGE_SIZE,
  })

const CatalogPage: React.FC<ICatalogPageProps> = ({ categories, initial }) => {
  const router = useRouter()
  const categorySlug = firstQueryValue(router.query.category)
  const pageNumber = Number(firstQueryValue(router.query.page) ?? '1') || 1

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  const isDefaultParams = categorySlug === null && pageNumber === 1 && debouncedSearch === ''

  const {
    data: page,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<IPage<IProduct>>(['catalog-products', categorySlug, debouncedSearch, pageNumber], fetchCatalogPage, {
    // Первая страница без фильтров уже пришла статикой — подставляем её, а не гоняем повторный запрос.
    fallbackData: isDefaultParams && initial !== null ? initial : undefined,
    // Смена категории/страницы не должна перекрашивать сетку в скелетон:
    // прошлая страница остаётся на экране, пока грузится следующая.
    keepPreviousData: true,
  })

  const error =
    fetchError === undefined
      ? null
      : isApiError(fetchError)
        ? fetchError.message
        : 'Не удалось загрузить каталог.'

  /** Категория и страница — в адресе; `shallow`, потому что данные тянет `useSWR` выше. */
  const updateQuery = useCallback(
    (next: { category?: string | null; page?: number }) => {
      const query: Record<string, string> = {}
      const nextCategory = next.category === undefined ? categorySlug : next.category
      const nextPage = next.page ?? pageNumber

      if (nextCategory !== null) {
        query.category = nextCategory
      }

      if (nextPage > 1) {
        query.page = String(nextPage)
      }

      void router.push({ pathname: '/catalog', query }, undefined, { shallow: true })
    },
    [categorySlug, pageNumber, router]
  )

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value)

      // Новый запрос — снова с первой страницы, иначе можно упасть в пустой хвост.
      if (pageNumber !== 1) {
        updateQuery({ page: 1 })
      }
    },
    [pageNumber, updateQuery]
  )

  const products = page?.items ?? []
  const total = page?.total ?? 0
  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map(category => [category.id, category.name])),
    [categories]
  )

  return (
    <SiteLayout>
      <Head>
        <title>Каталог — Lulu Beauty</title>
        <meta
          name="description"
          content="Косметика и уход: соберите заявку до закрытия ближайшего сбора."
        />
      </Head>

      <CatalogTemplate
        title="Каталог"
        summary={isLoading || page === undefined ? undefined : `Найдено товаров: ${total}`}
        filter={
          categories.length === 0 ? undefined : (
            <CategoryFilter
              categories={categories}
              selectedSlug={categorySlug}
              onSelect={slug => updateQuery({ category: slug, page: 1 })}
            />
          )
        }
        search={<SearchField value={search} onChange={handleSearch} />}
        pagination={
          <Pagination
            page={pageNumber}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={next => updateQuery({ page: next })}
          />
        }
      >
        {error === null ? (
          <ProductGrid
            products={products}
            isLoading={isLoading}
            buildHref={product => `/catalog/${product.slug}`}
            categoryNames={categoryNames}
            renderAction={product =>
              product.inStock ? (
                <AddToCartButton productId={product.id} isCompact={true} />
              ) : null
            }
            emptyState={
              <EmptyState
                title="Ничего не нашлось"
                description="Попробуйте изменить запрос или выбрать другую категорию."
              />
            }
          />
        ) : (
          <Alert
            tone="danger"
            title="Каталог не загрузился"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void mutate()
                }}
              >
                Повторить
              </Button>
            }
          >
            {error}
          </Alert>
        )}
      </CatalogTemplate>
    </SiteLayout>
  )
}

export default CatalogPage
