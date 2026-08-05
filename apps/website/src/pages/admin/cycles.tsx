import React, { useMemo, useState } from 'react'
import type { GetServerSideProps } from 'next'
import type { ICycleDraft, IOrderCycle } from 'widgets/types'
import { AdminCycleCalendar } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { storeIso, storeToday } from 'widgets/utils'
import { AdminShell } from '@/layouts/AdminShell'
import { useAuthedRequest } from '@/hooks/useAuthedRequest'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import { createCycle, deleteCycle, listCycles, updateCycle } from '@/services/endpoints/admin'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'

/**
 * Календарь дедлайнов.
 *
 * Сегодняшняя дата и стартовый месяц приходят из `getServerSideProps`, а не
 * считаются в браузере: страница рендерится на сервере, и вычисленное на
 * клиенте «сегодня» разошлось бы с разметкой на границе суток.
 *
 * Активный сбор спрашивается отдельно (`GET /cycles/active`), а не выводится
 * из поля `status`: статус переставляет планировщик по расписанию, и сразу
 * после создания сбор ещё `UPCOMING`, хотя покупателю уже отдаётся как
 * открытый. Показывать владельцу «Запланирован» там, где покупатель уже
 * оформляет заявки, нельзя.
 */

interface ICyclesPageProps extends IAdminPageProps {
  /** `YYYY-MM-DD` по таймзоне магазина. */
  today: string
  /** `YYYY-MM`. */
  initialMonth: string
}

interface ICyclesData {
  cycles: IOrderCycle[]
  activeId: string | null
}

const AdminCyclesPage: React.FC<ICyclesPageProps> = ({ today, initialMonth }) => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [month, setMonth] = useState(initialMonth)
  const [version, setVersion] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useMemo(
    () =>
      async (): Promise<ICyclesData> => ({
        cycles: await listCycles(),
        activeId: (await getActiveCycleOrNull())?.id ?? null,
      }),
    []
  )

  const { data, isLoading, error } = useAuthedRequest(
    'admin-cycles',
    load,
    'Не удалось загрузить сборы.',
    version
  )

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setIsBusy(true)
    setActionError(null)

    try {
      await action()
      notify({ tone: 'success', title: success })
      setVersion(current => current + 1)
    } catch (cause: unknown) {
      const message = isApiError(cause) ? cause.message : 'Действие не выполнено.'

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setIsBusy(false)
    }
  }

  /** Дата и время «по магазину» → мгновение, которое ждёт бэкенд. */
  const toDeadline = (draft: ICycleDraft): string => storeIso(draft.date, draft.time)

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
      summary="Дедлайн закрывает приём заявок: после него корзины покупателей очищаются, а открытым становится следующий сбор."
    >
      <AdminCycleCalendar
        cycles={data?.cycles ?? []}
        month={month}
        today={today}
        activeCycleId={data?.activeId ?? null}
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
        onDelete={cycle => {
          void handleDelete(cycle)
        }}
      />
    </AdminShell>
  )
}

export const getServerSideProps: GetServerSideProps<ICyclesPageProps> = async context => {
  const gate = await requireAdmin<ICyclesPageProps>(context)

  if (gate.redirect) {
    return gate.redirect
  }

  const { date, month } = storeToday()

  return { props: { user: gate.user, today: date, initialMonth: month } }
}

export default AdminCyclesPage
