import React, { useState } from 'react'
import useSWR from 'swr'
import type { GetServerSideProps } from 'next'
import type { IAdminCategoryValues, ICategory } from 'widgets/types'
import { AdminCategoriesPanel } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import { createCategory, deleteCategory, updateCategory } from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'
import { categoriesKey } from '@/services/swrKeys'

/**
 * Категории каталога.
 *
 * Удаление категории товары не трогает: на бэкенде у `products.category_id`
 * стоит `ON DELETE SET NULL`, то есть они просто теряют категорию. Об этом
 * прямо сказано в подтверждении — иначе владелец боится нажать.
 */
const AdminCategoriesPage: React.FC<IAdminPageProps> = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [isBusy, setIsBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR<ICategory[]>(categoriesKey, () => listCategories())

  const error =
    fetchError === undefined
      ? null
      : isApiError(fetchError)
        ? fetchError.message
        : 'Не удалось загрузить категории.'

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setIsBusy(true)
    setActionError(null)

    try {
      await action()
      notify({ tone: 'success', title: success })
      await mutate()
    } catch (cause: unknown) {
      const message = isApiError(cause) ? cause.message : 'Действие не выполнено.'

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setIsBusy(false)
    }
  }

  const handleDelete = async (category: ICategory): Promise<void> => {
    const confirmed = await confirm({
      title: 'Удалить категорию?',
      description: `Товары категории «${category.name}» останутся в каталоге, но потеряют её — фильтр по ней исчезнет.`,
      confirmLabel: 'Удалить',
    })

    if (confirmed) {
      await run(() => deleteCategory(category.id), 'Категория удалена')
    }
  }

  return (
    <AdminShell
      title="Категории"
      summary="По ним покупатель фильтрует каталог, а импорт xlsx находит категорию по слагу."
    >
      <AdminCategoriesPanel
        categories={data ?? []}
        isLoading={isLoading}
        isBusy={isBusy}
        error={error ?? actionError}
        onCreate={(values: IAdminCategoryValues) => {
          void run(() => createCategory(values), 'Категория добавлена')
        }}
        onUpdate={(category, values) => {
          void run(() => updateCategory(category.id, values), 'Категория сохранена')
        }}
        onDelete={category => {
          void handleDelete(category)
        }}
      />
    </AdminShell>
  )
}

export const getServerSideProps: GetServerSideProps<IAdminPageProps> = async context => {
  const gate = await requireAdmin<IAdminPageProps>(context)

  return gate.redirect ?? { props: { user: gate.user } }
}

export default AdminCategoriesPage
