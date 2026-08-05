import React, { useMemo, useState } from 'react'
import type { GetServerSideProps } from 'next'
import type { ICategory, IPage, IProduct } from 'widgets/types'
import { Alert, Button, Switch } from 'widgets/atoms'
import { CategoryFilter, EmptyState, Pagination, SearchField } from 'widgets/molecules'
import { AdminProductsTable } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { useDebouncedValue } from 'widgets/hooks'
import { IconPlus } from 'widgets/svg'
import { AdminShell } from '@/layouts/AdminShell'
import { useAuthedRequest } from '@/hooks/useAuthedRequest'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import { deleteProduct, listAdminProducts, restoreProduct } from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'
import * as styles from '@/styles/admin.css'

/**
 * Список товаров: поиск, фильтр по категории, показ удалённых, пагинация.
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

interface IProductsData {
  page: IPage<IProduct>
  categories: ICategory[]
}

const AdminProductsPage: React.FC<IAdminPageProps> = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [search, setSearch] = useState('')
  const [categorySlug, setCategorySlug] = useState<string | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Поиск меняется на каждый символ — в запрос он уходит с задержкой.
  const query = useDebouncedValue(search, 300)

  const load = useMemo(
    () =>
      async (): Promise<IProductsData> => ({
        page: await listAdminProducts({
          q: query === '' ? undefined : query,
          category: categorySlug ?? undefined,
          includeDeleted,
          page,
          pageSize: PAGE_SIZE,
        }),
        categories: await listCategories(),
      }),
    [query, categorySlug, includeDeleted, page]
  )

  const { data, isLoading, error } = useAuthedRequest(
    load,
    'Не удалось загрузить товары.',
    version
  )

  const categoryNames = Object.fromEntries(
    (data?.categories ?? []).map(category => [category.id, category.name])
  )

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
      setVersion(current => current + 1)
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
        <Button link={{ href: '/admin/products/new' }} iconStart={<IconPlus />}>
          Добавить товар
        </Button>
      }
    >
      <div className={styles.filters}>
        <SearchField
          label="Поиск по названию"
          value={search}
          onChange={next => {
            setSearch(next)
            setPage(1)
          }}
        />

        <Switch
          label="Показывать удалённые"
          checked={includeDeleted}
          onChange={next => {
            setIncludeDeleted(next)
            setPage(1)
          }}
        />
      </div>

      <CategoryFilter
        categories={data?.categories ?? []}
        selectedSlug={categorySlug}
        onSelect={next => {
          setCategorySlug(next)
          setPage(1)
        }}
      />

      {(error ?? actionError) !== null && (
        <Alert tone="danger" title="Не получилось">
          {error ?? actionError}
        </Alert>
      )}

      <AdminProductsTable
        products={data?.page.items ?? []}
        categoryNames={categoryNames}
        buildEditHref={product => `/admin/products/${product.id}`}
        isLoading={isLoading}
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
            action={<Button link={{ href: '/admin/products/new' }}>Добавить товар</Button>}
          />
        }
      />

      {data !== null && data.page.total > PAGE_SIZE && (
        <Pagination
          page={data.page.page}
          pageSize={data.page.pageSize}
          total={data.page.total}
          onChange={setPage}
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
