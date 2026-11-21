import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminPromoCodeValues } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminPromoCodeForm } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { useCustomerSearch } from '@/hooks/useCustomerSearch'
import { usePromoCodeParticipants } from '@/hooks/usePromoCodeParticipants'
import { usePromotionCatalog } from '@/hooks/usePromotionCatalog'
import { isApiError, messageForError } from '@/services/apiErrors'
import {
  deletePromoCode,
  getAdminPromoCode,
  updatePromoCode,
} from '@/services/endpoints/promoCodes'
import { adminPromoCodeKey, isAdminPromoCodesKey } from '@/services/swrKeys'
import { deleteConfirmation, initialValuesOf, toPromoCodeInput } from '@/utils/promoCodes'

/**
 * Карточка промокода: код, окно действия, «кому», условия и награды.
 *
 * После «Сохранить» форма пересоздаётся (`saveVersion`) и показывает то, что
 * вернул бэкенд: нормализованный код, подрезанное название. Архивный промокод
 * открывается как обычно, но с предупреждением: применить его уже нельзя, а
 * строка кода остаётся занятой.
 */

const NOT_FOUND = 404

const AdminPromoCodePage: React.FC = () => {
  const router = useRouter()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const participants = usePromoCodeParticipants()
  const customerSearch = useCustomerSearch(true)

  const promoCodeId = typeof router.query.id === 'string' ? router.query.id : null

  const [saveVersion, setSaveVersion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    data: promoCode,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR(promoCodeId === null ? null : adminPromoCodeKey(promoCodeId), () =>
    getAdminPromoCode(promoCodeId as string)
  )

  const error =
    fetchError === undefined ? null : messageForError(fetchError, 'admin.promoCodes.load')
  const status = isApiError(fetchError) ? fetchError.status : null

  const catalog = usePromotionCatalog(promoCode?.conditions, promoCode?.rewards)
  const initialValues = useMemo(
    () => (promoCode === undefined ? undefined : initialValuesOf(promoCode)),
    [promoCode]
  )

  const handleSubmit = async (values: IAdminPromoCodeValues): Promise<void> => {
    if (promoCodeId === null) {
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const saved = await updatePromoCode(promoCodeId, toPromoCodeInput(values))

      notify({ tone: 'success', title: 'Промокод сохранён', description: saved.code })
      await mutate(saved, { revalidate: false })
      void globalMutate(isAdminPromoCodesKey)
      setSaveVersion(current => current + 1)
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.promoCode.update'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (promoCode === undefined) {
      return
    }

    const confirmed = await confirm(deleteConfirmation(promoCode))

    if (!confirmed) {
      return
    }

    try {
      const { deleted } = await deletePromoCode(promoCode.id)

      notify({
        tone: 'success',
        title: deleted ? 'Промокод удалён' : 'Промокод убран в архив',
      })
      void globalMutate(isAdminPromoCodesKey)
      await router.push('/admin/promo-codes')
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.promoCode.delete'))
    }
  }

  const content = (): React.ReactNode => {
    if (status === NOT_FOUND) {
      return (
        <EmptyState
          title="Промокод не найден"
          description="Возможно, его удалили насовсем или ссылка устарела"
          action={
            <Button isFullWidth="mobile" link={{ href: '/admin/promo-codes' }}>
              К списку промокодов
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

    if (isLoading || promoCode === undefined || initialValues === undefined) {
      return <Skeleton height={420} shape="block" />
    }

    return (
      <>
        {promoCode.deletedAt !== null && (
          <Alert tone="warning" title="Промокод в архиве">
            Покупатели не могут его применить, а сам код остаётся занят. Скидки в заявках сохранены.
          </Alert>
        )}

        <AdminPromoCodeForm
          key={saveVersion}
          catalog={catalog}
          customerSelect={customerSearch.props}
          initialValues={initialValues}
          isSaved={true}
          isSubmitting={isSubmitting}
          error={formError}
          onSubmit={values => {
            void handleSubmit(values)
          }}
          footer={
            promoCode.deletedAt === null ? (
              <Button
                isFullWidth="mobile"
                variant="danger"
                onClick={() => {
                  void handleDelete()
                }}
              >
                {promoCode.participantsCount > 0 ? 'В архив' : 'Удалить промокод'}
              </Button>
            ) : undefined
          }
        />
      </>
    )
  }

  return (
    <AdminShell
      title={promoCode?.title ?? 'Промокод'}
      summary={promoCode === undefined ? undefined : `Код: ${promoCode.code}`}
      actions={
        <>
          {promoCode !== undefined && (
            <Button
              isFullWidth="mobile"
              variant="secondary"
              onClick={() => {
                participants.open(promoCode)
              }}
            >
              Использования ({promoCode.participantsCount})
            </Button>
          )}
          <Button isFullWidth="mobile" variant="secondary" link={{ href: '/admin/promo-codes' }}>
            К списку
          </Button>
        </>
      }
    >
      {content()}
      {participants.dialog}
    </AdminShell>
  )
}

export default AdminPromoCodePage
