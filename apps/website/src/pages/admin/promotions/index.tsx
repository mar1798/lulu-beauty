import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IPromotion } from 'widgets/types'
import { Alert, Button, Switch } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminPromotionsTable } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { IconPlus } from 'widgets/svg'
import { AdminShell } from '@/layouts/AdminShell'
import { flagParam, useQueryParams } from '@/hooks/useQueryParams'
import { usePromotionParticipants } from '@/hooks/usePromotionParticipants'
import { messageForError, type ErrorScope } from '@/services/apiErrors'
import {
  deletePromotion,
  listAdminPromotions,
  setPromotionEnabled,
} from '@/services/endpoints/promotions'
import { SHOWCASE_PATHS, promotionPath, refreshPublicPages } from '@/services/endpoints/revalidate'
import { adminPromotionsKey, isAdminPromotionsKey } from '@/services/swrKeys'
import { deleteConfirmation } from '@/utils/promotions'
import * as styles from '@/styles/admin.css'

/**
 * Список акций: период, статус, награды, участники и ряд иконок-действий.
 *
 * Статус считает бэкенд (по строке и по часам), поэтому после любого действия
 * список перечитывается целиком, а не правится на месте: включение меняет и
 * статус, и порядок «Активна/Выключена».
 *
 * Показ архивных — параметром `deleted` в адресе, как «Показывать удалённые» у
 * товаров. Удаление акции с участниками бэкенд превращает в архив — об этом
 * сказано в подтверждении (`deleteConfirmation`).
 *
 * Карусель на витрине живёт в статике каталога, поэтому каждое изменение просит
 * пересобрать `/` и `/catalog`.
 */
const AdminPromotionsPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const participants = usePromotionParticipants()

  const [{ deleted: includeDeleted }, setParams] = useQueryParams({ deleted: flagParam })

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data,
    error: fetchError,
    mutate,
  } = useSWR(adminPromotionsKey(includeDeleted), () => listAdminPromotions(includeDeleted))

  const error =
    fetchError === undefined ? null : messageForError(fetchError, 'admin.promotions.load')
  const isFirstLoad = data === undefined && fetchError === undefined

  const runAction = async <T,>(
    promotion: IPromotion,
    action: () => Promise<T>,
    success: string | ((result: T) => string),
    scope: ErrorScope
  ): Promise<void> => {
    setBusyId(promotion.id)
    setActionError(null)

    try {
      const result = await action()

      notify({
        tone: 'success',
        title: typeof success === 'function' ? success(result) : success,
        description: promotion.title,
      })
      refreshPublicPages(...SHOWCASE_PATHS, promotionPath(promotion.slug))
      await mutate()
      // Другие варианты списка (с архивом и без) тоже устарели.
      void globalMutate(isAdminPromotionsKey)
    } catch (cause: unknown) {
      const message = messageForError(cause, scope)

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (promotion: IPromotion): Promise<void> => {
    const confirmed = await confirm(deleteConfirmation(promotion))

    if (confirmed) {
      await runAction(
        promotion,
        () => deletePromotion(promotion.id),
        ({ deleted }) => (deleted ? 'Акция удалена' : 'Акция убрана в архив'),
        'admin.promotion.delete'
      )
    }
  }

  return (
    <AdminShell
      title="Акции"
      summary="Скидки, подарки и промокоды: что и при каких условиях получает покупатель"
      actions={
        <Button
          isFullWidth="mobile"
          link={{ href: '/admin/promotions/add' }}
          iconStart={<IconPlus />}
        >
          Добавить акцию
        </Button>
      }
    >
      <div className={styles.filters}>
        <div className={styles.filterSwitches}>
          <Switch
            label="Показывать архивные"
            checked={includeDeleted}
            onChange={next => setParams({ deleted: next })}
          />
        </div>
      </div>

      {(error ?? actionError) !== null && (
        <Alert tone="danger" title="Не получилось">
          {error ?? actionError}
        </Alert>
      )}

      <AdminPromotionsTable
        promotions={data ?? []}
        buildEditHref={promotion => `/admin/promotions/${promotion.id}`}
        buildDuplicateHref={promotion => `/admin/promotions/add?from=${promotion.id}`}
        isLoading={isFirstLoad}
        busyId={busyId}
        onToggleEnabled={promotion => {
          void runAction(
            promotion,
            () => setPromotionEnabled(promotion.id, !promotion.isEnabled),
            promotion.isEnabled ? 'Акция выключена' : 'Акция включена',
            'admin.promotion.toggle'
          )
        }}
        onShowParticipants={participants.open}
        onDelete={promotion => {
          void handleDelete(promotion)
        }}
        emptyState={
          <EmptyState
            title="Акций пока нет"
            description="Создайте первую: скидку на заявку от суммы, подарок или промокод за покупку"
            action={
              <Button isFullWidth="mobile" link={{ href: '/admin/promotions/add' }}>
                Добавить акцию
              </Button>
            }
          />
        }
      />

      {participants.dialog}
    </AdminShell>
  )
}

export default AdminPromotionsPage
