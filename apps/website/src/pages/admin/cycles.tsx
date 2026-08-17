import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { ICycleDraft, IOrderCycle } from 'widgets/types'
import { AdminCycleCalendar } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { storeIso, storeToday } from 'widgets/utils'
import { AdminShell } from '@/layouts/AdminShell'
import { messageForError } from '@/services/apiErrors'
import {
  closeCycle,
  createCycle,
  deleteCycle,
  listCycles,
  updateCycle,
} from '@/services/endpoints/admin'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { activeCycleKey, cyclesKey } from '@/services/swrKeys'

/**
 * Календарь дедлайнов.
 *
 * Сегодняшняя дата считается в браузере (см. `useState` ниже), а не приходит
 * пропсом с сервера: страница статическая, и «сегодня», зашитое в сборку,
 * протухло бы на следующий же день.
 *
 * Активный сбор спрашивается отдельно (`GET /cycles/active`), а не выводится
 * из поля `status`: статус переставляет планировщик по расписанию, и сразу
 * после создания сбор ещё `UPCOMING`, хотя покупателю уже отдаётся как
 * открытый. Показывать владельцу «Запланирован» там, где покупатель уже
 * оформляет заявки, нельзя.
 */

const AdminCyclesPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  /*
    Дата берётся один раз на монтирование — ленивым инициализатором, а не
    эффектом: эффект добавил бы лишний кадр с пустым календарём (и запрещён
    здесь правилом `react-hooks/set-state-in-effect`).

    Расхождения гидратации это не даёт: до ответа `/api/auth/me` `AdminShell`
    рисует спиннер вместо содержимого, поэтому в статику календарь не попадает
    вовсе — а на клиенте он строится уже по сегодняшней дате браузера.
  */
  const [{ date: today, month: currentMonth }] = useState(storeToday)
  /** Показываемый месяц, `YYYY-MM`. */
  const [month, setMonth] = useState(currentMonth)
  const [isBusy, setIsBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data: cycles,
    isLoading: isCyclesLoading,
    error: cyclesError,
    mutate: mutateCycles,
  } = useSWR<IOrderCycle[]>(cyclesKey, () => listCycles())

  // Общий ключ с обзором (`/admin`): дедлайн, назначенный здесь, виден там без перезахода.
  const { data: activeCycle, isLoading: isActiveLoading } = useSWR(activeCycleKey, () =>
    getActiveCycleOrNull()
  )

  const isLoading = isCyclesLoading || isActiveLoading
  const error = cyclesError === undefined ? null : messageForError(cyclesError, 'admin.cycles')

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setIsBusy(true)
    setActionError(null)

    try {
      await action()
      notify({ tone: 'success', title: success })
      await mutateCycles()
      void globalMutate(activeCycleKey)
    } catch (cause: unknown) {
      const message = messageForError(cause, 'admin.cycles')

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setIsBusy(false)
    }
  }

  /** Дата и время «по магазину» → мгновение, которое ждёт бэкенд. */
  const toDeadline = (draft: ICycleDraft): string => storeIso(draft.date, draft.time)

  const handleClose = async (cycle: IOrderCycle): Promise<void> => {
    const confirmed = await confirm({
      title: 'Закрыть сбор сейчас?',
      description:
        'Приём заявок прекратится немедленно, как по дедлайну: неоформленные корзины покупателей ' +
        'переедут в избранное, а вам придёт итог сбора. Отменить это нельзя — сбор придётся открыть заново.',
      confirmLabel: 'Закрыть сбор',
    })

    if (confirmed) {
      await run(() => closeCycle(cycle.id), 'Сбор закрыт')
    }
  }

  const handleDelete = async (cycle: IOrderCycle): Promise<void> => {
    const confirmed = await confirm({
      title: 'Удалить сбор?',
      description:
        'Если в сборе уже есть заявки, бэкенд удалить не даст — сначала придётся разобраться с ними.',
      confirmLabel: 'Удалить',
    })

    if (confirmed) {
      await run(() => deleteCycle(cycle.id), 'Сбор удалён')
    }
  }

  return (
    <AdminShell
      title="Сборы заказов"
      summary="Открытый сбор всегда один: дедлайн закрывает приём заявок, неоформленные корзины переезжают в избранное, а открытым становится следующий. Закрыть сбор можно и досрочно."
    >
      <AdminCycleCalendar
        cycles={cycles ?? []}
        month={month}
        today={today}
        activeCycleId={activeCycle?.id ?? null}
        isLoading={isLoading}
        isBusy={isBusy}
        error={error ?? actionError}
        onMonthChange={setMonth}
        onCreate={draft => {
          void run(
            () =>
              createCycle({
                deadlineAt: toDeadline(draft),
                label: draft.label === '' ? null : draft.label,
              }),
            'Сбор назначен'
          )
        }}
        onUpdate={(cycle, draft) => {
          void run(
            () =>
              updateCycle(cycle.id, {
                deadlineAt: toDeadline(draft),
                label: draft.label === '' ? null : draft.label,
              }),
            'Сбор сохранён'
          )
        }}
        onClose={cycle => {
          void handleClose(cycle)
        }}
        onDelete={cycle => {
          void handleDelete(cycle)
        }}
      />
    </AdminShell>
  )
}

export default AdminCyclesPage
