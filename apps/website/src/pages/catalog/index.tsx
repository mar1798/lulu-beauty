import React, { useCallback, useMemo } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import type { GetStaticProps } from 'next'
import type { ICategory, IPage, IProduct } from 'widgets/types'
import { Alert, Button } from 'widgets/atoms'
import { CategoryFilter, EmptyState, Pagination, SearchField } from 'widgets/molecules'
import { ProductGrid } from 'widgets/organisms'
import { CatalogTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import {
  optionalTextParam,
  pageParam,
  textParam,
  useQueryParams,
  useQueryTextInput,
} from '@/hooks/useQueryParams'
import { isApiError } from '@/services/apiErrors'
import { listCategories, listProducts } from '@/services/endpoints/catalog'

/**
 * Витрина.
 *
 * Первая страница каталога приезжает статикой (SSG + ISR), поэтому пустой
 * каталог никогда не «мигает» спиннером. Категория, поиск и номер страницы —
 * всё, что уходит в запрос, — живут в query-параметрах, так что ссылкой на
 * конкретную выборку можно поделиться.
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

type ICatalogKey = readonly [tag: 'catalog-products', category: string | null, q: string, page: number]

const fetchCatalogPage = async ([, category, q, page]: ICatalogKey): Promise<IPage<IProduct>> =>
  listProducts({
    category: category ?? undefined,
    q: q === '' ? undefined : q,
    page,
    pageSize: PAGE_SIZE,
  })

const CatalogPage: React.FC<ICatalogPageProps> = ({ categories, initial }) => {
  const [{ category: categorySlug, q, page: pageNumber }, setParams] = useQueryParams({
    category: optionalTextParam,
    q: textParam,
    page: pageParam,
  })

  /*
    Поиск заменяет запись в истории, а не добавляет новую: набранное слово
    оказывается в адресе (ссылку можно переслать), но «назад» уводит к прошлой
    категории, а не отматывает набор по букве. Новый запрос — снова с первой
    страницы, иначе можно попасть в пустой хвост.
  */
  const commitSearch = useCallback(
    (next: string) => {
      setParams({ q: next, page: 1 }, { replace: true })
    },
    [setParams]
  )

  const [search, setSearch] = useQueryTextInput(q, commitSearch)

  const isDefaultParams = categorySlug === null && pageNumber === 1 && q === ''

  const {
    data: page,
    error: fetchError,
    mutate,
  } = useSWR<IPage<IProduct>>(['catalog-products', categorySlug, q, pageNumber], fetchCatalogPage, {
    // Первая страница без фильтров уже пришла статикой — подставляем её, а не гоняем повторный запрос.
    fallbackData: isDefaultParams && initial !== null ? initial : undefined,
    // Смена категории/страницы не должна перекрашивать сетку в скелетон:
    // прошлая страница остаётся на экране, пока грузится следующая.
    keepPreviousData: true,
  })

  /*
    Скелетон — только когда показывать нечего. `isLoading` из SWR для этого не
    годится: он считается по текущему ключу и при смене категории становится
    `true`, хотя `keepPreviousData` держит на экране прошлую страницу. Раньше
    сетка на каждый клик по категории проваливалась в скелетон и возвращалась —
    это и было мигание.
  */
  const isFirstLoad = page === undefined

  const error =
    fetchError === undefined
      ? null
      : isApiError(fetchError)
        ? fetchError.message
        : 'Не удалось загрузить каталог.'

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
        summary={isFirstLoad ? undefined : `Найдено товаров: ${total}`}
        filter={
          categories.length === 0 ? undefined : (
            <CategoryFilter
              categories={categories}
              selectedSlug={categorySlug}
              onSelect={slug => setParams({ category: slug, page: 1 })}
            />
          )
        }
        search={<SearchField value={search} onChange={setSearch} />}
        pagination={
          <Pagination
            page={pageNumber}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={next => setParams({ page: next })}
          />
        }
      >
        {error === null ? (
          <ProductGrid
            products={products}
            isLoading={isFirstLoad}
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
