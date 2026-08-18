import React, { useState } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminProductValues, IProductImage, IProductImageUpload } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminProductForm } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { isApiError, messageForError } from '@/services/apiErrors'
import {
  deleteProduct,
  deleteProductImage,
  getAdminProduct,
  listAdminBrands,
  restoreProduct,
  updateProduct,
  uploadProductImage,
} from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'
import {
  adminBrandsKey,
  adminProductKey,
  categoriesKey,
  isAdminBrandsKey,
  isAdminProductsKey,
} from '@/services/swrKeys'

/**
 * Карточка товара: поля и фотография.
 *
 * Фотография у товара одна: загрузка на бэкенде заменяет прежнюю, а не
 * добавляется к ней. Поэтому после загрузки и удаления товар перезагружается
 * целиком — локально это значило бы повторить логику бэкенда второй раз
 * и однажды разойтись с ней.
 *
 * Удалённый товар не редиректит и не прячется: он открывается как обычно, но
 * сверху висит предупреждение и кнопка восстановления. Иначе ссылка из списка
 * удалённых вела бы в никуда.
 */

const NOT_FOUND = 404

const AdminProductPage: React.FC = () => {
  const router = useRouter()
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const productId = typeof router.query.id === 'string' ? router.query.id : null

  // Ключ формы: после сохранения форма должна показать ответ бэкенда
  // (нормализованный slug, обрезанное описание), а не то, что было набрано.
  const [saveVersion, setSaveVersion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isImageBusy, setIsImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  const {
    data: product,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR(productId === null ? null : adminProductKey(productId), () =>
    getAdminProduct(productId as string)
  )

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.products.load')
  const status = isApiError(fetchError) ? fetchError.status : null

  // Общий ключ с «Категориями» (`/admin/categories`): правка там видна тут без перезагрузки.
  const { data: categories } = useSWR(categoriesKey, () => listCategories())

  /*
    Бренды — подсказки для поля «Производитель». С удалёнными товарами: бренд,
    оставшийся только на снятом с продажи, всё равно уже заведён, и подсказать
    его написание нужно, иначе он вернётся в каталог вторым — в другом регистре.
  */
  const { data: brands } = useSWR(adminBrandsKey(true), () => listAdminBrands(true))

  const handleSubmit = async (values: IAdminProductValues): Promise<void> => {
    if (productId === null) {
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      await updateProduct(productId, {
        name: values.name,
        slug: values.slug,
        description: values.description === '' ? null : values.description,
        brand: values.brand,
        priceCents: values.priceCents,
        volumeMl: values.volumeMl,
        categoryId: values.categoryId,
        inStock: values.inStock,
      })

      notify({ tone: 'success', title: 'Товар сохранён' })
      await mutate()
      // Вписанный бренд обязан оказаться в подсказках и в фильтре списка.
      void globalMutate(isAdminBrandsKey)
      setSaveVersion(current => current + 1)
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.product.update'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const runImageAction = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setIsImageBusy(true)
    setImageError(null)

    try {
      await action()
      notify({ tone: 'success', title: success })
      await mutate()
      setSaveVersion(current => current + 1)
    } catch (cause: unknown) {
      setImageError(messageForError(cause, 'admin.product.images'))
    } finally {
      setIsImageBusy(false)
    }
  }

  const handleImageUpload = (upload: IProductImageUpload): void => {
    if (productId === null) {
      return
    }

    void runImageAction(
      () =>
        uploadProductImage(productId, {
          file: upload.file,
          alt: upload.alt === '' ? undefined : upload.alt,
        }),
      'Фотография загружена'
    )
  }

  const handleImageDelete = async (image: IProductImage): Promise<void> => {
    if (productId === null) {
      return
    }

    const confirmed = await confirm({
      title: 'Удалить фотографию?',
      description: 'Файл пропадёт из каталога сразу.',
      confirmLabel: 'Удалить',
    })

    if (confirmed) {
      await runImageAction(
        () => deleteProductImage(productId, image.id),
        'Фотография удалена'
      )
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (product === undefined) {
      return
    }

    const confirmed = await confirm({
      title: 'Удалить товар?',
      description: `«${product.name}» пропадёт из каталога. В уже оформленных заявках он останется.`,
      confirmLabel: 'Удалить',
    })

    if (!confirmed) {
      return
    }

    try {
      await deleteProduct(product.id)
      notify({ tone: 'success', title: 'Товар удалён' })
      // Список товаров ещё не смонтирован — инвалидируем все его варианты фильтров разом.
      void globalMutate(isAdminProductsKey)
      await router.push('/admin/products')
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.product.delete'))
    }
  }

  const handleRestore = async (): Promise<void> => {
    if (product === undefined) {
      return
    }

    try {
      await restoreProduct(product.id)
      notify({ tone: 'success', title: 'Товар восстановлен' })
      await mutate()
      setSaveVersion(current => current + 1)
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.product.restore'))
    }
  }

  const content = (): React.ReactNode => {
    if (status === NOT_FOUND) {
      return (
        <EmptyState
          title="Товар не найден"
          description="Возможно, его удалили насовсем или ссылка устарела."
          action={
            <Button isFullWidth="mobile" link={{ href: '/admin/products' }}>
              К списку товаров
            </Button>
          }
        />
      )
    }

    if (error !== null) {
      return (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )
    }

    if (isLoading || product === undefined) {
      return <Skeleton height={420} shape="block" />
    }

    return (
      <>
        {product.deletedAt !== null && (
          <Alert tone="warning" title="Товар удалён">
            Покупатели его не видят. Восстановите — и он вернётся в каталог.
          </Alert>
        )}

        <AdminProductForm
          key={saveVersion}
          categories={categories ?? []}
          brands={brands}
          product={product}
          isSubmitting={isSubmitting}
          error={formError}
          images={product.images}
          isImageBusy={isImageBusy}
          imageError={imageError}
          onSubmit={values => {
            void handleSubmit(values)
          }}
          onImageUpload={handleImageUpload}
          onImageDelete={image => {
            void handleImageDelete(image)
          }}
          footer={
            product.deletedAt === null ? (
              <Button
                isFullWidth="mobile"
                variant="danger"
                onClick={() => {
                  void handleDelete()
                }}
              >
                Удалить товар
              </Button>
            ) : (
              <Button
                isFullWidth="mobile"
                variant="secondary"
                onClick={() => {
                  void handleRestore()
                }}
              >
                Восстановить
              </Button>
            )
          }
        />
      </>
    )
  }

  return (
    <AdminShell
      title={product?.name ?? 'Товар'}
      summary={product === undefined ? undefined : `/catalog/${product.slug}`}
      actions={
        <Button isFullWidth="mobile" variant="secondary" link={{ href: '/admin/products' }}>
          К списку
        </Button>
      }
    >
      {content()}
    </AdminShell>
  )
}

export default AdminProductPage
