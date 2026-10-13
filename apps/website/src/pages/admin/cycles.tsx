import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { ICycleDraft, IOrderCycle } from 'widgets/types'
import { AdminCycleCalendar } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { formatDateTime, storeIso, storeToday } from 'widgets/utils'
import { AdminShell } from '@/layouts/AdminShell'
import { messageForError } from '@/services/apiErrors'
import {
  closeCycle,
  createCycle,
  deleteCycle,
  getCycleDeletion,
  listCycles,
  updateCycle,
} from '@/services/endpoints/admin'
import type { ICycleDeletion } from '@/services/endpoints/admin'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { SHOWCASE_PATHS, refreshPublicPages } from '@/services/endpoints/revalidate'
import { activeCycleKey, cyclesKey, isAdminOrdersKey } from '@/services/swrKeys'

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

/**
 * Десять дней после закрытия, пока сбор не удалить, — `DELETABLE_AFTER` на бэкенде.
 * Столько же покупатель может вернуть свою отменённую заявку, и удаление не должно
 * забрать то, что сайт ещё предлагает вернуть.
 */
const DELETABLE_AFTER_MS = 10 * 24 * 60 * 60 * 1000

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
      // Открытый сбор и его дедлайн стоят на главной и в каталоге, а закрытый
      // сбор ещё и прячет кнопки «в корзину» — статика обязана это догнать.
      refreshPublicPages(...SHOWCASE_PATHS)
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
        'переедут в избранное, а вам придёт итог сбора. Отменить это нельзя - сбор придётся открыть заново.',
      confirmLabel: 'Закрыть сбор',
    })

    if (confirmed) {
      await run(() => closeCycle(cycle.id), 'Сбор закрыт')
    }
  }

  /*
    Удаляется только закрытый сбор, и не раньше чем через десять дней после
    закрытия: в эти дни заявки в нём подтверждают, оплачивают и выдают, а
    покупатель ещё может вернуть свою отменённую. Кнопка объясняет
    это заранее; решает всё равно бэкенд (`cycle_not_closed`,
    `cycle_closed_recently`) - часы браузера ему не указ.
  */
  const deleteUnavailableReason = (cycle: IOrderCycle): string | null => {
    if (cycle.status !== 'CLOSED') {
      return 'Удалить можно только закрытый сбор'
    }

    const closedAt = Date.parse(cycle.closedAt ?? cycle.deadlineAt)
    const deletableAt = closedAt + DELETABLE_AFTER_MS

    return deletableAt > Date.now()
      ? `Сбор закрыт меньше десяти дней назад - удалить его можно с ${formatDateTime(new Date(deletableAt).toISOString())}`
      : null
  }

  /*
    Сколько заявок пропадёт, спрашивается у бэкенда перед подтверждением, и то же
    число уходит в запрос на удаление: если к тому моменту заявок станет другое
    число, бэкенд ответит `cycle_orders_changed` и ничего не тронет. Заявки в
    работе, с оплатой или с чеком удаление запрещают вовсе - тогда и спрашивать
    не о чем. Пока идёт подсчёт, кнопки заняты: иначе двойное нажатие открыло бы
    два подтверждения, и второе удаление кончилось бы «Сбор не найден».
  */
  const handleDelete = async (cycle: IOrderCycle): Promise<void> => {
    let deletion: ICycleDeletion

    setIsBusy(true)
    try {
      deletion = await getCycleDeletion(cycle.id)
    } catch (cause: unknown) {
      notify({
        tone: 'danger',
        title: 'Не получилось',
        description: messageForError(cause, 'admin.cycles'),
      })
      return
    } finally {
      setIsBusy(false)
    }

    if (deletion.blockingOrders > 0) {
      notify({
        tone: 'danger',
        title: 'Сбор удалить нельзя',
        description: `Заявок в работе, с оплатой или с чеком: ${deletion.blockingOrders}. Удаляется только сбор, где остались отменённые и выданные заявки, за которые денег не присылали.`,
      })
      return
    }

    const confirmed = await confirm({
      title: 'Удалить сбор?',
      description:
        deletion.orders === 0
          ? 'Заявок в сборе нет, удалится только сама запись о нём.'
          : `Заявок в сборе: ${deletion.orders} - все отменённые или выданные, денег за них не присылали. Они удалятся навсегда вместе со сбором, и из кабинетов покупателей тоже. Уведомлений покупателям не будет. Отменить это нельзя.`,
      confirmLabel: 'Удалить',
      tone: 'danger',
    })

    if (confirmed) {
      await run(() => deleteCycle(cycle.id, deletion.orders), 'Сбор удалён')
      // Список заявок с фильтром «все сборы» показывал бы удалённые до перезахода.
      void globalMutate(isAdminOrdersKey)
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
        deleteUnavailableReason={deleteUnavailableReason}
      />
    </AdminShell>
  )
}

export default AdminCyclesPage
