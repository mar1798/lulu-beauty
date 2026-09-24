import React, { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import type { IProduct, ISelectOption } from 'widgets/types'
import { Alert, Button, Select, Switch } from 'widgets/atoms'
import { CategoryFilter, EmptyState, Pagination, SearchField } from 'widgets/molecules'
import { AdminProductsTable } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { IconPlus } from 'widgets/svg'
import { AdminShell } from '@/layouts/AdminShell'
import {
  flagParam,
  optionalTextParam,
  pageParam,
  textParam,
  useQueryParams,
  useQueryTextInput,
} from '@/hooks/useQueryParams'
import { messageForError, type ErrorScope } from '@/services/apiErrors'
import {
  deleteProduct,
  listAdminBrands,
  listAdminProducts,
  restoreProduct,
} from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'
import { SHOWCASE_PATHS, productPath, refreshPublicPages } from '@/services/endpoints/revalidate'
import { adminBrandsKey, adminProductsKey, categoriesKey } from '@/services/swrKeys'
import { scrollToTop } from '@/utils/scroll'
import * as styles from '@/styles/admin.css'

/**
 * Список товаров: поиск, фильтр по категории, показ удалённых, пагинация.
 *
 * Все параметры выборки — в адресной строке, поэтому конкретный вид списка
 * можно переслать или положить в закладки, а «назад» возвращает к прошлому
 * набору фильтров.
 *
 * Удаление мягкое, поэтому строка не исчезает, а помечается — и её можно
 * вернуть. Признак удаления берётся из `deletedAt`: в ответе больше ничем
 * живой товар от удалённого не отличается.
 *
 * После любой мутации список перезагружается целиком (`version` в ключе
 * загрузчика), а не правится на месте: `deletedAt` и порядок строк считает
 * бэкенд, и локальная правка разошлась бы с ним при первом же обновлении.
 */

const PAGE_SIZE = 20

const SEARCH_DELAY_MS = 300

/** Сентинел «все бренды»: у `Select` нет значения `null`, пустая строка — сброс. */
const ALL_BRANDS = ''

const AdminProductsPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [{ q: query, category: categorySlug, brand, deleted: includeDeleted, page }, setParams] =
    useQueryParams({
      q: textParam,
      category: optionalTextParam,
      brand: optionalTextParam,
      deleted: flagParam,
      page: pageParam,
    })

  /*
    Поиск заменяет запись в истории, а не добавляет новую: набранное оказывается
    в адресе, но «назад» не приходится жать по разу на букву.
  */
  const commitSearch = useCallback(
    (next: string) => {
      setParams({ q: next, page: 1 }, { replace: true })
    },
    [setParams]
  )

  const [search, setSearch] = useQueryTextInput(query, commitSearch, SEARCH_DELAY_MS)

  /*
    Пагинация внизу таблицы: без прокрутки следующая страница начинается за
    верхним краем экрана, и владелец остаётся у кнопок, глядя на её хвост.
    Прокрутка своя, а не встроенная в переход (`scroll: false`), — иначе Next
    дёрнул бы страницу к началу мгновенно.
  */
  const goToPage = useCallback(
    (next: number) => {
      setParams({ page: next }, { scroll: false })
      scrollToTop()
    },
    [setParams]
  )

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  /*
    Запрос, по которому пришли строки, лежащие сейчас в `data`. `keepPreviousData`
    намеренно держит прошлую выдачу на экране при смене любого параметра, так что
    «данных по текущему ключу нет» (`isLoading`) не отличает поиск от клика по
    категории — а скелетон нужен только на поиске.
  */
  const [loadedQuery, setLoadedQuery] = useState(query)

  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR(
    adminProductsKey(query, categorySlug ?? '', brand ?? '', includeDeleted, page),
    () =>
      listAdminProducts({
        q: query === '' ? undefined : query,
        category: categorySlug ?? undefined,
        brand: brand ?? undefined,
        includeDeleted,
        page,
        pageSize: PAGE_SIZE,
      }),
    // Смена фильтра/страницы не должна сбрасывать таблицу в скелетон.
    { keepPreviousData: true }
  )

  /*
    `isLoading` ложно ровно тогда, когда на экране выдача по текущему ключу.
    Правка состояния прямо в рендере — тот самый случай, ради которого React её
    допускает: значение целиком выводится из пропсов загрузчика, и перерисовка
    случается сразу, до кадра, то есть скелетон не успевает мигнуть.
  */
  if (!isLoading && loadedQuery !== query) {
    setLoadedQuery(query)
  }

  /*
    Скелетон — только пока показывать нечего. `isLoading` из SWR считается по
    текущему ключу и на смене фильтра становится `true` даже с
    `keepPreviousData`, из-за чего таблица мигала скелетоном на каждый клик.

    Ошибка тоже снимает скелетон: данных не будет вовсе, и без этой половины
    условия под сообщением «Не получилось» крутилась вечная загрузка.
  */
  const isFirstLoad = data === undefined && fetchError === undefined

  /*
    Поиск считается идущим с первой буквы, а не с ухода запроса, — как в
    подборщике товара (`useProductSearch`): дебаунс `useQueryTextInput` длится
    те же доли секунды, и всё это время в таблице лежит выдача по прошлому слову.
    Отсюда две половины: `search !== query` — набранное ещё не доехало до адреса,
    `isLoading` при разошедшемся `loadedQuery` — запрос по новому слову в пути.

    Второе слагаемое молчит там, где ответ уже есть: повтор того же слова SWR
    берёт из кеша, `isLoading` при этом ложно, и мигания скелетоном на готовой
    выдаче не будет. Смену категории, бренда или страницы оно тоже не задевает —
    там `loadedQuery` уже совпадает с `query`.

    Сравнение дословное, без `trim`: в адрес уезжает ровно набранное, пробелы
    включительно (`textParam`), и подрезанная копия никогда бы с ним не совпала —
    поиск остался бы «занят» навсегда.
  */
  const isSearching = search !== query || (isLoading && loadedQuery !== query)

  // Общий ключ с «Категориями» (`/admin/categories`): правка там видна тут без перезагрузки.
  const { data: categories } = useSWR(categoriesKey, () => listCategories())

  /*
    Список брендов пересобирается вместе с показом удалённых: бренд, оставшийся
    только на удалённых товарах, должен появляться в фильтре ровно тогда, когда
    такие товары показаны.
  */
  const { data: brands } = useSWR(adminBrandsKey(includeDeleted), () =>
    listAdminBrands(includeDeleted)
  )

  /*
    Выбранный бренд добавляется в список, даже если его там уже нет: иначе после
    выключения «показывать удалённые» (или прихода по чужой ссылке) фильтр
    остаётся включённым, но поле пустое — и снять его нечем.
  */
  const brandOptions = useMemo<ISelectOption[]>(() => {
    const names = brands ?? []
    const known = brand === null || names.includes(brand) ? names : [...names, brand]

    return [
      { value: ALL_BRANDS, label: 'Все бренды' },
      ...known.map(name => ({ value: name, label: name })),
    ]
  }, [brands, brand])

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.products.load')

  const categoryNames = Object.fromEntries(
    (categories ?? []).map(category => [category.id, category.name])
  )

  const runAction = async (
    product: IProduct,
    action: () => Promise<unknown>,
    success: string,
    scope: ErrorScope
  ): Promise<void> => {
    setBusyId(product.id)
    setActionError(null)

    try {
      await action()
      notify({ tone: 'success', title: success, description: product.name })
      // Удаление и восстановление меняют и витрину, и саму карточку товара.
      refreshPublicPages(...SHOWCASE_PATHS, productPath(product.slug))
      await mutate()
    } catch (cause: unknown) {
      const message = messageForError(cause, scope)

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (product: IProduct): Promise<void> => {
    const confirmed = await confirm({
      title: 'Удалить товар?',
      description: `«${product.name}» пропадёт из каталога. В уже оформленных заявках он останется - там состав и цены закреплены на момент заказа.`,
      confirmLabel: 'Удалить',
    })

    if (confirmed) {
      await runAction(
        product,
        () => deleteProduct(product.id),
        'Товар удалён',
        'admin.product.delete'
      )
    }
  }

  return (
    <AdminShell
      title="Товары"
      summary="Каталог целиком: и то, что видят покупатели, и удалённое"
      actions={
        <Button
          isFullWidth="mobile"
          link={{ href: '/admin/products/add' }}
          iconStart={<IconPlus />}
        >
          Добавить товар
        </Button>
      }
    >
      {/*
        Категория и бренд стоят рядом: это два фильтра одного назначения, и
        разносить их по разным местам экрана незачем. Раньше категория жила
        рядом с разделами слева — там ей было место, пока она была столбцом
        чипов во всю ширину колонки.
      */}
      <div className={styles.filters}>
        {/*
          Без подписи: placeholder у поля — тот же «Поиск по названию».
          Спиннер на месте лупы — занятость видна там, куда человек печатает,
          ещё до того как таблица ниже встанет скелетоном.
        */}
        <SearchField value={search} onChange={setSearch} isBusy={isSearching} />

        <CategoryFilter
          categories={categories ?? []}
          selectedSlug={categorySlug}
          onSelect={next => setParams({ category: next, page: 1 })}
        />

        <Select
          label="Бренд"
          value={brand ?? ALL_BRANDS}
          options={brandOptions}
          onChange={next => setParams({ brand: next === ALL_BRANDS ? null : next, page: 1 })}
        />

        <Switch
          label="Показывать удалённые"
          checked={includeDeleted}
          onChange={next => setParams({ deleted: next, page: 1 })}
        />
      </div>

      {(error ?? actionError) !== null && (
        <Alert tone="danger" title="Не получилось">
          {error ?? actionError}
        </Alert>
      )}

      <AdminProductsTable
        products={data?.items ?? []}
        categoryNames={categoryNames}
        buildEditHref={product => `/admin/products/${product.id}`}
        /*
          Скелетон и на поиске, а не только на первой загрузке: прошлая выдача
          под новым словом читалась бы как ответ на него, а «Товаров не нашлось»
          на полсекунды — как ответ по недобранному слову.
        */
        isLoading={isFirstLoad || isSearching}
        busyId={busyId}
        onDelete={product => {
          void handleDelete(product)
        }}
        onRestore={product => {
          void runAction(
            product,
            () => restoreProduct(product.id),
            'Товар восстановлен',
            'admin.product.restore'
          )
        }}
        emptyState={
          <EmptyState
            title="Товаров не нашлось"
            description="Измените фильтры или добавьте первый товар - вручную либо импортом из xlsx"
            action={
              <Button isFullWidth="mobile" link={{ href: '/admin/products/add' }}>
                Добавить товар
              </Button>
            }
          />
        }
      />

      {data !== undefined && data.total > PAGE_SIZE && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onChange={goToPage}
        />
      )}
    </AdminShell>
  )
}

export default AdminProductsPage
