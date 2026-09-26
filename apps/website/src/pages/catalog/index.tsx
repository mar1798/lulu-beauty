import React, { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import type { GetStaticProps } from 'next'
import type { ICategory, IPage, IProduct, ISelectOption } from 'widgets/types'
import { Alert, Button, Select } from 'widgets/atoms'
import { CategoryFilter, Pagination, SearchField } from 'widgets/molecules'
import { ProductGrid } from 'widgets/organisms'
import { CatalogTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { ClosedCycleNotice } from '@/components/ClosedCycleNotice'
import { CycleCountdown } from '@/components/CycleCountdown'
import { JsonLd } from '@/components/JsonLd'
import { PageMeta } from '@/components/PageMeta'
import { WantedProductPrompt } from '@/components/WantedProductPrompt'
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
import { activeCycleFallback, isFreshRender, type ISwrFallback } from '@/services/swrFallback'
import { productListLd } from '@/utils/jsonLd'
import { scrollToTop } from '@/utils/scroll'
import { CATALOG_DESCRIPTION, CATALOG_TITLE } from '@/utils/seo'
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

/**
 * Сколько карточек грузят фотографию сразу.
 *
 * Сетка каталога — это и есть первый экран, и её первая карточка оказывается
 * LCP-элементом страницы. Ленивой браузер узнаёт о ней только после раскладки:
 * на мобильном замере это стоило 1,5 с задержки до начала загрузки при том,
 * что сама картинка весит 12 КиБ и качается за треть секунды.
 *
 * Четыре — ширина самого широкого ряда сетки (`md` и выше); на узком экране
 * колонок две, то есть предзагружается ещё и второй ряд, который там наполовину
 * в кадре. Больше ставить нельзя: приоритет у всей страницы отбирает канал сам
 * у себя и отодвигает ровно ту картинку, ради которой затевался.
 */
const PRIORITY_CARDS = 4

/** Каталог меняется импортом xlsx, минута устаревания приемлема. */
const REVALIDATE_SECONDS = 60

/**
 * До скольких товаров в выдаче витрина предлагает рассказать, чего не хватает.
 *
 * Не только на пустой выдаче: три карточки вместо каталога — это тот же ответ
 * «у нас этого нет», просто с двумя случайными совпадениями по названию, и
 * молчать в этот момент значит отпустить человека ни с чем. Порог держится
 * низким намеренно — форма под полной страницей товаров читалась бы как
 * жалоба на ассортимент, которой никто не подавал повода.
 */
const WANTED_PROMPT_MAX_RESULTS = 3

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

const CatalogPage: React.FC<ICatalogPageProps> = ({ categories, brands, initial, fallback }) => {
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

  /*
    Пагинация внизу сетки, и следующая страница начинается за верхним краем
    экрана: без прокрутки человек остаётся у кнопок, глядя на хвост нового
    набора. Прокрутка своя, а не встроенная в переход (`scroll: false`), —
    иначе Next дёрнул бы страницу к началу мгновенно.
  */
  const goToPage = useCallback(
    (next: number) => {
      setParams({ page: next }, { scroll: false })
      scrollToTop()
    },
    [setParams]
  )

  const isDefaultParams = categorySlug === null && brand === null && pageNumber === 1 && q === ''

  /*
    Первая страница без фильтров уже пришла статикой. `fallbackData` сам по
    себе повторный запрос не отменяет — SWR всё равно перепроверяет значение
    при монтировании, и запрос уходил, конкурируя с гидратацией и
    `/api/auth/me`. Для только что собранной страницы он и правда лишний.

    Но ISR отдаёт протухшую копию сразу, а пересобирает в фоне, — и статика
    может оказаться сколь угодно старой, с прежними ценами и наличием. Такую
    перепроверяем (`isFreshRender`, `services/swrFallback.ts`).

    Только при монтировании: смена категории, бренда, поиска или страницы
    меняет ключ, и новый набор запрашивается как обычно.
  */
  const staticPage = isDefaultParams && initial !== null ? initial : undefined

  const {
    data: page,
    error: fetchError,
    isValidating,
    mutate,
  } = useSWR<IPage<IProduct>>(
    ['catalog-products', categorySlug, brand, q, pageNumber],
    fetchCatalogPage,
    {
      fallbackData: staticPage,
      revalidateOnMount: staticPage === undefined || !isFreshRender(fallback),
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

  /*
    Выдача на экране есть, но она уже не про то, что набрано. Скелетоном её
    подменять нельзя (ради этого и стоит `keepPreviousData`), а молчать —
    значит полсекунды показывать прошлые товары как ответ: человек дописывает
    букву, и ничего не происходит.

    Два слагаемых, потому что ожидание из двух частей: `search !== q` —
    набранное ещё не доехало до адреса (дебаунс `useQueryTextInput`),
    `isValidating` — запрос по новому ключу уже в пути. Первое сетевой флаг не
    покрывает: ключ в этот момент ещё старый.

    Сравнение дословное, без `trim`: в адрес уезжает ровно набранное, пробелы
    включительно (`textParam`), и подрезанная копия с ним никогда бы не
    совпала — поиск остался бы «занят» навсегда.
  */
  const isStale = !isFirstLoad && (search !== q || isValidating)

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
      {/*
        `path` без query-параметров намеренно: категория, бренд, поиск и номер
        страницы живут в них, но HTML под всеми ими один и тот же — фильтрация
        клиентская. Канонический адрес у такой выборки общий, сам `/catalog`.
      */}
      <PageMeta title={CATALOG_TITLE} description={CATALOG_DESCRIPTION} path="/catalog" />

      {/*
        Список ровно тот, что сейчас на экране, а не статическая первая
        страница: фильтры клиентские, и разметка, застрявшая на исходной
        выборке, начала бы расходиться с видимой сеткой. Краулер приходит на
        канонический `/catalog` без параметров — там это одно и то же.

        Крошек у каталога нет ни в разметке, ни на экране: рисовать
        `BreadcrumbList` там, где цепочки не видно, значит обещать поисковику
        то, чего на странице нет.
      */}
      {products.length > 0 && <JsonLd data={productListLd(products)} />}

      <CatalogTemplate
        title="Каталог"
        summary={isFirstLoad ? undefined : `Найдено товаров: ${total}`}
        focusKey={pageNumber}
        // Срок сбора виден и здесь, а не только в герое главной: на витрину
        // приходят по ссылке на категорию и поиском, минуя главную вовсе.
        aside={<CycleCountdown />}
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
        search={<SearchField value={search} onChange={setSearch} isBusy={isStale} />}
        pagination={
          <Pagination page={pageNumber} pageSize={PAGE_SIZE} total={total} onChange={goToPage} />
        }
      >
        <ClosedCycleNotice />

        {error === null ? (
          <ProductGrid
            products={products}
            isLoading={isFirstLoad}
            isBusy={isStale}
            buildHref={product => `/catalog/${product.slug}`}
            categoryNames={categoryNames}
            priorityCount={PRIORITY_CARDS}
            renderAction={product =>
              product.inStock ? <AddToCartButton product={product} isCompact={true} /> : null
            }
            /*
              Сердце — у каждого товара, включая снятые с продажи: «нет в
              наличии» проходит, а сохранить его на следующий сбор — ровно то,
              зачем избранное и нужно.
            */
            renderMediaAction={product => (
              <WishlistButton productId={product.id} productName={product.name} />
            )}
            /*
              Пустая выдача — сразу форма пожелания, без отдельного «ничего не
              нашлось» над ней: заголовок формы говорит то же самое, и два
              блока подряд с одной мыслью читались бы как повтор.
            */
            emptyState={
              <WantedProductPrompt
                className={styles.wanted}
                description="Попробуйте изменить запрос, категорию или бренд - или расскажите, что вы ищете, и мы постараемся добавить это в следующий сбор"
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

        {/*
          Пожелание к следующему сбору под короткой выдачей. Пустую закрывает
          `emptyState` сетки, здесь — случай «что-то нашлось, но мало», и
          заголовок у него свой: «ничего не удалось найти» над найденными
          карточками было бы неправдой.

          `isFirstLoad` держит его до первого ответа, ошибка загрузки — тоже не
          отсутствие товара, и форму под ней не показываем.
        */}
        {error === null && !isFirstLoad && total > 0 && total < WANTED_PROMPT_MAX_RESULTS && (
          <WantedProductPrompt className={styles.wanted} title="Это не то, что вы искали?" />
        )}
      </CatalogTemplate>
    </SiteLayout>
  )
}

export default CatalogPage
