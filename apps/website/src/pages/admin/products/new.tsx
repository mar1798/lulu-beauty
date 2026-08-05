import React, { useMemo, useState } from 'react'
import type { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import type { IAdminProductValues, ICategory } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { AdminProductForm } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { useAuthedRequest } from '@/hooks/useAuthedRequest'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import { createProduct } from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'

/**
 * Создание товара.
 *
 * Фотографии здесь не загружаются: их некуда прикрепить, пока у товара нет
 * id. После создания уводим на карточку товара — там блок фотографий уже есть.
 */
const AdminProductCreatePage: React.FC<IAdminPageProps> = () => {
  const router = useRouter()
  const { notify } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useMemo(() => (): Promise<ICategory[]> => listCategories(), [])
  const { data: categories, isLoading } = useAuthedRequest(
    'admin-categories',
    load,
    'Не удалось загрузить категории.'
  )

  const handleSubmit = async (values: IAdminProductValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const product = await createProduct({
        name: values.name,
        slug: values.slug,
        description: values.description === '' ? null : values.description,
        priceCents: values.priceCents,
        categoryId: values.categoryId,
        inStock: values.inStock,
      })

      notify({ tone: 'success', title: 'Товар создан', description: 'Добавьте фотографии.' })
      await router.replace(`/admin/products/${product.id}`)
    } catch (cause: unknown) {
      setError(isApiError(cause) ? cause.message : 'Не удалось создать товар.')
      setIsSubmitting(false)
    }
  }

  return (
    <AdminShell
      title="Новый товар"
      summary="Фотографии добавляются после создания — им нужен уже сохранённый товар."
      actions={
        <Button variant="secondary" link={{ href: '/admin/products' }}>
          К списку
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton height={320} shape="block" />
      ) : (
        <>
          {categories === null && (
            <Alert tone="warning" title="Категории не загрузились">
              Товар можно создать и без категории — добавите её позже.
            </Alert>
          )}

          <AdminProductForm
            categories={categories ?? []}
            isSubmitting={isSubmitting}
            error={error}
            onSubmit={values => {
              void handleSubmit(values)
            }}
          />
        </>
      )}
    </AdminShell>
  )
}

export const getServerSideProps: GetServerSideProps<IAdminPageProps> = async context => {
  const gate = await requireAdmin<IAdminPageProps>(context)

  return gate.redirect ?? { props: { user: gate.user } }
}

export default AdminProductCreatePage
