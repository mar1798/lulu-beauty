import React, { useCallback, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminPromoCode } from 'widgets/types'
import { Alert, Button, Switch } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminPromoCodesTable } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { IconPlus } from 'widgets/svg'
import { AdminShell } from '@/layouts/AdminShell'
import { flagParam, useQueryParams } from '@/hooks/useQueryParams'
import { usePromoCodeParticipants } from '@/hooks/usePromoCodeParticipants'
import { messageForError, type ErrorScope } from '@/services/apiErrors'
import {
  deletePromoCode,
  listAdminPromoCodes,
  setPromoCodeEnabled,
} from '@/services/endpoints/promoCodes'
import { adminPromoCodesKey, isAdminPromoCodesKey } from '@/services/swrKeys'
import { deleteConfirmation } from '@/utils/promoCodes'
import * as styles from '@/styles/admin.css'

/**
 * Список промокодов владельца: код с кнопкой «Скопировать», кому, период, награды,
 * статус и число использований.
 *
 * Статус считает бэкенд (по строке и по часам), поэтому после любого действия
 * список перечитывается целиком, а не правится на месте.
 *
 * Показ архивных - параметром `deleted` в адресе, как у акций. Удаление
 * применённого кода бэкенд превращает в архив - об этом сказано в подтверждении
 * (`deleteConfirmation`). Промокоды не показываются на витрине, поэтому
 * статические страницы после изменений не пересобираются.
 */
const AdminPromoCodesPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const participants = usePromoCodeParticipants()

  const [{ deleted: includeDeleted }, setParams] = useQueryParams({ deleted: flagParam })

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data,
    error: fetchError,
    mutate,
  } = useSWR(adminPromoCodesKey(includeDeleted), () => listAdminPromoCodes(includeDeleted))

  const error =
    fetchError === undefined ? null : messageForError(fetchError, 'admin.promoCodes.load')
  const isFirstLoad = data === undefined && fetchError === undefined

  const copy = useCallback(
    (promoCode: IAdminPromoCode): void => {
      void (async (): Promise<void> => {
        try {
          await navigator.clipboard.writeText(promoCode.code)
          notify({ tone: 'success', title: 'Код скопирован', description: promoCode.code })
        } catch {
          // Без доступа к буферу (http): код виден в строке, его можно выделить вручную.
          notify({
            tone: 'warning',
            title: 'Не удалось скопировать',
            description: 'Выделите код в списке и скопируйте вручную',
          })
        }
      })()
    },
    [notify]
  )

  const runAction = async <T,>(
    promoCode: IAdminPromoCode,
    action: () => Promise<T>,
    success: string | ((result: T) => string),
    scope: ErrorScope
  ): Promise<void> => {
    setBusyId(promoCode.id)
    setActionError(null)

    try {
      const result = await action()

      notify({
        tone: 'success',
        title: typeof success === 'function' ? success(result) : success, description: promoCode.code })
      await mutate()
      // Другие варианты списка (с архивом и без) тоже устарели.
      void globalMutate(isAdminPromoCodesKey)
    } catch (cause: unknown) {
      const message = messageForError(cause, scope)

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (promoCode: IAdminPromoCode): Promise<void> => {
    const confirmed = await confirm(deleteConfirmation(promoCode))

    if (confirmed) {
      await runAction(
        promoCode,
        () => deletePromoCode(promoCode.id),
        ({ deleted }) => (deleted ? 'Промокод удалён' : 'Промокод убран в архив'),
        'admin.promoCode.delete'
      )
    }
  }

  return (
    <AdminShell
      title="Промокоды"
      summary="Коды для покупателей: общие и персональные, со своими условиями и наградами"
      actions={
        <Button
          isFullWidth="mobile"
          link={{ href: '/admin/promo-codes/add' }}
          iconStart={<IconPlus />}
        >
          Добавить промокод
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

      <AdminPromoCodesTable
        promoCodes={data ?? []}
        buildEditHref={promoCode => `/admin/promo-codes/${promoCode.id}`}
        buildDuplicateHref={promoCode => `/admin/promo-codes/add?from=${promoCode.id}`}
        isLoading={isFirstLoad}
        busyId={busyId}
        onCopy={copy}
        onToggleEnabled={promoCode => {
          void runAction(
            promoCode,
            () => setPromoCodeEnabled(promoCode.id, !promoCode.isEnabled),
            promoCode.isEnabled ? 'Промокод выключен' : 'Промокод включён',
            'admin.promoCode.toggle'
          )
        }}
        onShowParticipants={participants.open}
        onDelete={promoCode => {
          void handleDelete(promoCode)
        }}
        emptyState={
          <EmptyState
            title="Промокодов пока нет"
            description="Создайте первый: общий для всех покупателей или персональный, со скидкой или подарком"
            action={
              <Button isFullWidth="mobile" link={{ href: '/admin/promo-codes/add' }}>
                Добавить промокод
              </Button>
            }
          />
        }
      />

      {participants.dialog}
    </AdminShell>
  )
}

export default AdminPromoCodesPage
