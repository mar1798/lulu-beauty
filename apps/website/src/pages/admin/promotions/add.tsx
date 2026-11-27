import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminPromotionValues } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { AdminPromotionForm } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { usePromotionCatalog } from '@/hooks/usePromotionCatalog'
import { messageForError } from '@/services/apiErrors'
import {
  createPromotion,
  getAdminPromotion,
  uploadPromotionBanner,
} from '@/services/endpoints/promotions'
import { SHOWCASE_PATHS, promotionPath, refreshPublicPages } from '@/services/endpoints/revalidate'
import { adminPromotionKey, isAdminBannersKey, isAdminPromotionsKey } from '@/services/swrKeys'
import { duplicateOf, toPromotionInput } from '@/utils/promotions'

/**
 * Создание акции.
 *
 * `?from=<id>` — «Дублировать»: форма открывается предзаполненной другой акцией
 * (`duplicateOf`), отдельного эндпоинта нет. Исходная акция читается тем же
 * запросом, что и карточка, поэтому после списка она приходит из кеша.
 *
 * Баннеры выбираются в форме и грузятся следующими запросами сразу после
 * создания: id акции появляется только в ответе на первый. Неудача баннера не
 * откатывает акцию — она уже создана, и причину владельцу называют прямо здесь;
 * загрузить файл он сможет на карточке, куда страница и ведёт после сохранения.
 */
const AdminPromotionCreatePage: React.FC = () => {
  const router = useRouter()
  const { notify } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceId = typeof router.query.from === 'string' ? router.query.from : null

  const { data: source, isLoading: isSourceLoading } = useSWR(
    sourceId === null ? null : adminPromotionKey(sourceId),
    () => getAdminPromotion(sourceId as string)
  )

  const initialValues = useMemo(
    () => (source === undefined ? undefined : duplicateOf(source)),
    [source]
  )

  const catalog = usePromotionCatalog(initialValues?.conditions, initialValues?.rewards)

  const handleSubmit = async (values: IAdminPromotionValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const promotion = await createPromotion(toPromotionInput(values))
      const failures: string[] = []

      for (const variant of ['mobile', 'desktop'] as const) {
        const file = values.banners[variant]

        if (file === null) {
          continue
        }

        try {
          await uploadPromotionBanner(promotion.id, variant, file)
        } catch (cause: unknown) {
          failures.push(
            `${variant === 'mobile' ? 'Мобильный' : 'Десктопный'} баннер: ${messageForError(cause, 'admin.promotion.banner')}`
          )
        }
      }

      notify({ tone: 'success', title: 'Акция создана', description: values.title })

      if (failures.length > 0) {
        notify({
          tone: 'info',
          title: 'Баннеры загрузились не все',
          description: `${failures.join(' ')} Повторите на карточке акции.`,
        })
      }

      refreshPublicPages(...SHOWCASE_PATHS, promotionPath(promotion.slug))
      void globalMutate(isAdminPromotionsKey)
      void globalMutate(isAdminBannersKey)
      await router.push(`/admin/promotions/${promotion.id}`)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.promotion.create'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminShell
      title={sourceId === null ? 'Новая акция' : 'Копия акции'}
      summary={
        sourceId === null
          ? undefined
          : 'Условия и награды скопированы. Выберите даты - копия создаётся выключенной.'
      }
      actions={
        <Button isFullWidth="mobile" variant="secondary" link={{ href: '/admin/promotions' }}>
          К списку
        </Button>
      }
    >
      {sourceId !== null && isSourceLoading ? (
        <Skeleton height={420} shape="block" />
      ) : (
        <>
          {sourceId !== null && source === undefined && (
            <Alert tone="warning" title="Исходная акция не нашлась">
              Форма пустая - создайте акцию с нуля.
            </Alert>
          )}

          <AdminPromotionForm
            // Копия приезжает после первого рендера — форма пересоздаётся с её значениями.
            key={source?.id ?? 'new'}
            catalog={catalog}
            initialValues={initialValues}
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

export default AdminPromotionCreatePage
