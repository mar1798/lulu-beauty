import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminPromoCodeValues } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { AdminPromoCodeForm } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { useCustomerSearch } from '@/hooks/useCustomerSearch'
import { usePromotionCatalog } from '@/hooks/usePromotionCatalog'
import { messageForError } from '@/services/apiErrors'
import { createPromoCode, getAdminPromoCode } from '@/services/endpoints/promoCodes'
import { adminPromoCodeKey, isAdminPromoCodesKey } from '@/services/swrKeys'
import { duplicateOf, toPromoCodeInput } from '@/utils/promoCodes'

/**
 * Создание промокода.
 *
 * `?from=<id>` - «Дублировать»: форма открывается предзаполненной другим
 * промокодом (`duplicateOf`), отдельного эндпоинта нет. Исходный код читается тем же
 * запросом, что и карточка, поэтому после списка он приходит из кеша.
 *
 * Сгенерированную строку кода знает только сервер, поэтому после создания она
 * называется в уведомлении, а страница ведёт на карточку кода.
 */
const AdminPromoCodeCreatePage: React.FC = () => {
  const router = useRouter()
  const { notify } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const customerSearch = useCustomerSearch(true)

  const sourceId = typeof router.query.from === 'string' ? router.query.from : null

  const { data: source, isLoading: isSourceLoading } = useSWR(
    sourceId === null ? null : adminPromoCodeKey(sourceId),
    () => getAdminPromoCode(sourceId as string)
  )

  const initialValues = useMemo(
    () => (source === undefined ? undefined : duplicateOf(source)),
    [source]
  )

  const catalog = usePromotionCatalog(initialValues?.conditions, initialValues?.rewards)

  const handleSubmit = async (values: IAdminPromoCodeValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const promoCode = await createPromoCode(toPromoCodeInput(values))

      notify({ tone: 'success', title: 'Промокод создан', description: promoCode.code })
      void globalMutate(isAdminPromoCodesKey)
      await router.push(`/admin/promo-codes/${promoCode.id}`)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.promoCode.create'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminShell
      title={sourceId === null ? 'Новый промокод' : 'Копия промокода'}
      summary={
        sourceId === null
          ? undefined
          : 'Условия и награды скопированы. Код сгенерируется новый, даты выберите заново - копия создаётся выключенной.'
      }
      actions={
        <Button isFullWidth="mobile" variant="secondary" link={{ href: '/admin/promo-codes' }}>
          К списку
        </Button>
      }
    >
      {sourceId !== null && isSourceLoading ? (
        <Skeleton height={420} shape="block" />
      ) : (
        <>
          {sourceId !== null && source === undefined && (
            <Alert tone="warning" title="Исходный промокод не нашёлся">
              Форма пустая - создайте промокод с нуля.
            </Alert>
          )}

          <AdminPromoCodeForm
            // Копия приезжает после первого рендера - форма пересоздаётся с её значениями.
            key={source?.id ?? 'new'}
            catalog={catalog}
            customerSelect={customerSearch.props}
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

export default AdminPromoCodeCreatePage
