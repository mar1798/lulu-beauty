import React, { useState } from 'react'
import type { GetServerSideProps } from 'next'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminProductValues } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { AdminProductForm } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import { createProduct, uploadProductImage } from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'
import { categoriesKey, isAdminProductsKey } from '@/services/swrKeys'

/**
 * Создание товара.
 *
 * Никакого редиректа на карточку: страница — конвейер добавления, и после
 * успеха форма просто сбрасывается в чистое состояние (через `key`), чтобы
 * тут же можно было добавить следующий товар. Фото — необязательное поле
 * формы; если оно выбрано, грузится вторым запросом сразу после создания
 * товара (id появляется только в ответе на первый).
 */
const AdminProductCreatePage: React.FC<IAdminPageProps> = () => {
  const { notify } = useToast()
  const [formVersion, setFormVersion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: categories, isLoading } = useSWR(categoriesKey, () => listCategories())

  const handleSubmit = async (values: IAdminProductValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const product = await createProduct({
        name: values.name,
        slug: values.slug,
        description: values.description === '' ? null : values.description,
        brand: values.brand === '' ? null : values.brand,
        priceCents: values.priceCents,
        categoryId: values.categoryId,
        inStock: values.inStock,
      })

      if (values.image !== null) {
        try {
          await uploadProductImage(product.id, {
            file: values.image.file,
            alt: values.image.alt === '' ? undefined : values.image.alt,
            isPrimary: true,
          })
        } catch {
          notify({
            tone: 'info',
            title: 'Товар создан, но фото не загрузилось',
            description: 'Добавьте его на карточке товара.',
          })
        }
      }

      notify({ tone: 'success', title: 'Товар создан', description: values.name })
      // Список товаров ещё не смонтирован — инвалидируем все его варианты фильтров разом.
      void globalMutate(isAdminProductsKey)
      setFormVersion(current => current + 1)
    } catch (cause: unknown) {
      setError(isApiError(cause) ? cause.message : 'Не удалось создать товар.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminShell
      title="Новый товар"
      summary="После сохранения форма очищается — можно сразу добавить следующий товар."
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
          {categories === undefined && (
            <Alert tone="warning" title="Категории не загрузились">
              Товар можно создать и без категории — добавите её позже.
            </Alert>
          )}

          <AdminProductForm
            key={formVersion}
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
