import React, { useCallback, useMemo } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import type { GetStaticProps } from 'next'
import type { ICategory, IPage, IProduct, ISelectOption } from 'widgets/types'
import { Alert, Button, Select } from 'widgets/atoms'
import { CategoryFilter, EmptyState, Pagination, SearchField } from 'widgets/molecules'
import { ProductGrid } from 'widgets/organisms'
import { CatalogTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { ClosedCycleNotice } from '@/components/ClosedCycleNotice'
import { WishlistButton } from '@/components/WishlistButton'
import {
  optionalTextParam,
  pageParam,
  textParam,
  useQueryParams,
  useQueryTextInput,
} from '@/hooks/useQueryParams'
import { messageForError } from '@/services/apiErrors'
import { listBrands, listCategories, listProducts } from '@/services/endpoints/catalog'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { activeCycleFallback, type ISwrFallback } from '@/services/swrFallback'
import * as styles from '@/styles/catalog.css'

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
  /** Бренды, встречающиеся в каталоге; отдельной сущности у бренда нет — только строка. */
  brands: string[]
  /** `null` — API был недоступен на сборке; страница переживает это молча. */
  initial: IPage<IProduct> | null
  /** Состояние сбора для кеша SWR — чтобы витрина сразу встала правильной. */
  fallback: ISwrFallback
}

export const getStaticProps: GetStaticProps<ICatalogPageProps> = async () => {
  // Со своим `catch`: отсутствие сбора — штатное состояние, и оно не должно
  // ни ронять сборку, ни утаскивать за собой каталог.
  const cycle = await getActiveCycleOrNull().catch(() => null)

  try {
    const [categories, brands, initial] = await Promise.all([
      listCategories(),
      listBrands(),
      listProducts({ pageSize: PAGE_SIZE }),
    ])

    return {
      props: { categories, brands, initial, fallback: activeCycleFallback(cycle) },
      revalidate: REVALIDATE_SECONDS,
    }
  } catch {
    // Ронять `next build` из-за недоступного API нельзя — ISR подхватит позже.
    return {
      props: { categories: [], brands: [], initial: null, fallback: activeCycleFallback(cycle) },
      revalidate: REVALIDATE_SECONDS,
    }
  }
}

type ICatalogKey = readonly [
  tag: 'catalog-products',
  category: string | null,
  brand: string | null,
  q: string,
  page: number,
]

const fetchCatalogPage = async ([, category, brand, q, page]: ICatalogKey): Promise<
  IPage<IProduct>
> =>
  listProducts({
    category: category ?? undefined,
    brand: brand ?? undefined,
    q: q === '' ? undefined : q,
    page,
    pageSize: PAGE_SIZE,
  })

/** Сентинел «все бренды»: у `Select` нет значения `null`, пустая строка — сброс. */
const ALL_BRANDS = ''

const CatalogPage: React.FC<ICatalogPageProps> = ({ categories, brands, initial }) => {
  const [{ category: categorySlug, brand, q, page: pageNumber }, setParams] = useQueryParams({
    category: optionalTextParam,
    brand: optionalTextParam,
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

  const isDefaultParams = categorySlug === null && brand === null && pageNumber === 1 && q === ''

  const {
    data: page,
    error: fetchError,
    mutate,
  } = useSWR<IPage<IProduct>>(
    ['catalog-products', categorySlug, brand, q, pageNumber],
    fetchCatalogPage,
    {
      // Первая страница без фильтров уже пришла статикой — подставляем её, а не гоняем повторный запрос.
      fallbackData: isDefaultParams && initial !== null ? initial : undefined,
      // Смена категории/страницы не должна перекрашивать сетку в скелетон:
      // прошлая страница остаётся на экране, пока грузится следующая.
      keepPreviousData: true,
    }
  )

  /*
    Скелетон — только когда показывать нечего. `isLoading` из SWR для этого не
    годится: он считается по текущему ключу и при смене категории становится
    `true`, хотя `keepPreviousData` держит на экране прошлую страницу. Раньше
    сетка на каждый клик по категории проваливалась в скелетон и возвращалась —
    это и было мигание.
  */
  const isFirstLoad = page === undefined

  const error = fetchError === undefined ? null : messageForError(fetchError, 'catalog.load')

  const products = page?.items ?? []
  const total = page?.total ?? 0
  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map(category => [category.id, category.name])),
    [categories]
  )

  /*
    Выбранный бренд остаётся в списке, даже если его там уже нет: страница
    статическая (ISR), и по ссылке с `?brand=` можно прийти после того, как
    последний товар этого бренда пропал из каталога. Без этого фильтр был бы
    включён, а поле — пустым, и снять его было бы нечем.
  */
  const brandOptions = useMemo<ISelectOption[]>(() => {
    const known = brand === null || brands.includes(brand) ? brands : [...brands, brand]

    return [
      { value: ALL_BRANDS, label: 'Все бренды' },
      ...known.map(name => ({ value: name, label: name })),
    ]
  }, [brands, brand])

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
          // `> 1` — кроме «Все бренды» в списке есть хоть что-то выбираемое.
          categories.length === 0 && brandOptions.length <= 1 ? undefined : (
            <div className={styles.filters}>
              {categories.length > 0 && (
                <CategoryFilter
                  className={styles.field}
                  categories={categories}
                  selectedSlug={categorySlug}
                  onSelect={slug => setParams({ category: slug, page: 1 })}
                />
              )}

              {brandOptions.length > 1 && (
                <Select
                  className={styles.field}
                  label="Бренд"
                  value={brand ?? ALL_BRANDS}
                  options={brandOptions}
                  onChange={next =>
                    setParams({ brand: next === ALL_BRANDS ? null : next, page: 1 })
                  }
                />
              )}
            </div>
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
        <ClosedCycleNotice />

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
            /*
              Сердце — у каждого товара, включая снятые с продажи: «нет в
              наличии» проходит, а сохранить его на следующий сбор — ровно то,
              зачем избранное и нужно.
            */
            renderMediaAction={product => <WishlistButton productId={product.id} />}
            emptyState={
              <EmptyState
                title="Ничего не нашлось"
                description="Попробуйте изменить запрос или выбрать другую категорию или бренд."
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
