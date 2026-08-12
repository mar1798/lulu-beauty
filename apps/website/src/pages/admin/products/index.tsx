import React, { useCallback, useState } from 'react'
import useSWR from 'swr'
import type { GetServerSideProps } from 'next'
import type { IProduct } from 'widgets/types'
import { Alert, Button, Switch } from 'widgets/atoms'
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
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import { deleteProduct, listAdminProducts, restoreProduct } from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'
import { adminProductsKey, categoriesKey } from '@/services/swrKeys'
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

const AdminProductsPage: React.FC<IAdminPageProps> = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [{ q: query, category: categorySlug, deleted: includeDeleted, page }, setParams] =
    useQueryParams({
      q: textParam,
      category: optionalTextParam,
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

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data,
    error: fetchError,
    mutate,
  } = useSWR(
    adminProductsKey(query, categorySlug ?? '', includeDeleted, page),
    () =>
      listAdminProducts({
        q: query === '' ? undefined : query,
        category: categorySlug ?? undefined,
        includeDeleted,
        page,
        pageSize: PAGE_SIZE,
      }),
    // Смена фильтра/страницы не должна сбрасывать таблицу в скелетон.
    { keepPreviousData: true }
  )

  /*
    Скелетон — только пока показывать нечего. `isLoading` из SWR считается по
    текущему ключу и на смене фильтра становится `true` даже с
    `keepPreviousData`, из-за чего таблица мигала скелетоном на каждый клик.
  */
  const isFirstLoad = data === undefined

  // Общий ключ с «Категориями» (`/admin/categories`): правка там видна тут без перезагрузки.
  const { data: categories } = useSWR(categoriesKey, () => listCategories())

  const error =
    fetchError === undefined
      ? null
      : isApiError(fetchError)
        ? fetchError.message
        : 'Не удалось загрузить товары.'

  const categoryNames = Object.fromEntries((categories ?? []).map(category => [category.id, category.name]))

  const runAction = async (
    product: IProduct,
    action: () => Promise<unknown>,
    success: string
  ): Promise<void> => {
    setBusyId(product.id)
    setActionError(null)

    try {
      await action()
      notify({ tone: 'success', title: success, description: product.name })
      await mutate()
    } catch (cause: unknown) {
      const message = isApiError(cause) ? cause.message : 'Действие не выполнено.'

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (product: IProduct): Promise<void> => {
    const confirmed = await confirm({
      title: 'Удалить товар?',
      description: `«${product.name}» пропадёт из каталога. В уже оформленных заявках он останется — там хранится снимок на момент заказа.`,
      confirmLabel: 'Удалить',
    })

    if (confirmed) {
      await runAction(product, () => deleteProduct(product.id), 'Товар удалён')
    }
  }

  return (
    <AdminShell
      title="Товары"
      summary="Каталог целиком: и то, что видят покупатели, и удалённое."
      actions={
        <Button link={{ href: '/admin/products/add' }} iconStart={<IconPlus />}>
          Добавить товар
        </Button>
      }
      sidebar={
        <>
          <span className={styles.categorySidebarTitle}>Категория</span>
          <CategoryFilter
            categories={categories ?? []}
            selectedSlug={categorySlug}
            onSelect={next => setParams({ category: next, page: 1 })}
          />
        </>
      }
    >
      <div className={styles.filters}>
        <SearchField label="Поиск по названию" value={search} onChange={setSearch} />

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
        isLoading={isFirstLoad}
        busyId={busyId}
        onDelete={product => {
          void handleDelete(product)
        }}
        onRestore={product => {
          void runAction(product, () => restoreProduct(product.id), 'Товар восстановлен')
        }}
        emptyState={
          <EmptyState
            title="Товаров не нашлось"
            description="Измените фильтры или добавьте первый товар — вручную либо импортом из xlsx."
            action={<Button link={{ href: '/admin/products/add' }}>Добавить товар</Button>}
          />
        }
      />

      {data !== undefined && data.total > PAGE_SIZE && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onChange={next => setParams({ page: next })}
        />
      )}
    </AdminShell>
  )
}

export const getServerSideProps: GetServerSideProps<IAdminPageProps> = async context => {
  const gate = await requireAdmin<IAdminPageProps>(context)

  return gate.redirect ?? { props: { user: gate.user } }
}

export default AdminProductsPage
