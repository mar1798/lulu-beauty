import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminProductValues } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { AdminProductForm } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { messageForError } from '@/services/apiErrors'
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
const AdminProductCreatePage: React.FC = () => {
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
          })
        } catch (cause: unknown) {
          /*
            Товар уже создан, а фотография — нет: причину нужно назвать прямо
            здесь («больше 5 МБ», «формат не тот»), иначе человек пойдёт
            перезагружать тот же файл на карточке и получит ровно то же.
          */
          notify({
            tone: 'info',
            title: 'Товар создан, но фото не загрузилось',
            description: `${messageForError(cause, 'admin.product.images')} Фото можно добавить на карточке товара.`,
          })
        }
      }

      notify({ tone: 'success', title: 'Товар создан', description: values.name })
      // Список товаров ещё не смонтирован — инвалидируем все его варианты фильтров разом.
      void globalMutate(isAdminProductsKey)
      setFormVersion(current => current + 1)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.product.create'))
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

export default AdminProductCreatePage
