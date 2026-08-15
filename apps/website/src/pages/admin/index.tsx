import React from 'react'
import useSWR from 'swr'
import type { OrderStatus } from 'widgets/types'
import { Alert, Badge, Button, Skeleton, Text } from 'widgets/atoms'
import { DeadlineCountdown, orderStatusLabel } from 'widgets/molecules'
import { formatDateTime } from 'widgets/utils'
import { AdminShell } from '@/layouts/AdminShell'
import { useAuth } from '@/contexts/AuthContext'
import { messageForError } from '@/services/apiErrors'
import { listAdminOrders } from '@/services/endpoints/admin'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { activeCycleKey, adminOverviewKey } from '@/services/swrKeys'
import * as styles from '@/styles/admin.css'

/**
 * Обзор: текущий сбор и сколько заявок в каком статусе.
 *
 * Счётчики берутся из `total` пагинации (`pageSize: 1`), а не пересчётом
 * загруженных заявок: на второй странице список уже неполон, и «12 заявок»
 * превратилось бы в «20 на этой странице». Пять коротких запросов дешевле
 * выкачивания всех заявок ради счёта.
 *
 * Активный сбор — общий ключ с `/admin/cycles`: правка дедлайна там сразу
 * видна здесь без захода на эту страницу заново.
 */

const STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED']

const loadCounts = async (cycleId: string | undefined): Promise<Record<OrderStatus, number>> => {
  const totals = await Promise.all(
    STATUSES.map(status =>
      listAdminOrders({ status, cycleId, pageSize: 1 }).then(page => page.total)
    )
  )

  return Object.fromEntries(STATUSES.map((status, index) => [status, totals[index]])) as Record<
    OrderStatus,
    number
  >
}

const AdminOverviewPage: React.FC = () => {
  // Профиль берётся из сессии на клиенте: до гейта эта страница всё равно не
  // рисуется, а значит владелец здесь уже известен.
  const { user } = useAuth()

  const {
    data: cycleData,
    isLoading: isCycleLoading,
    error: cycleError,
  } = useSWR(activeCycleKey, () => getActiveCycleOrNull())
  const cycle = cycleData ?? null

  const {
    data: counts,
    isLoading: isCountsLoading,
    error: countsError,
  } = useSWR(isCycleLoading ? null : adminOverviewKey(cycle?.id ?? null), () =>
    loadCounts(cycle?.id)
  )

  const isLoading = isCycleLoading || isCountsLoading
  // Оба запроса, а не только сбор: пять счётчиков ходят одним `Promise.all`, и
  // отказ любого из них оставлял `counts` пустым — а плитки ниже честно
  // печатали «0 заявок». Владелец заходит после дедлайна, видит пять нулей и
  // решает, что никто ничего не заказал.
  const failure = cycleError ?? countsError
  const error = failure === undefined ? null : messageForError(failure, 'admin.orders')

  return (
    <AdminShell title="Обзор" summary={user === null ? undefined : `Вы вошли как ${user.name}.`}>
      {error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )}

      <section className={styles.panel}>
        <Text weight="semibold">Текущий сбор</Text>

        {isCycleLoading ? (
          <Skeleton height={72} shape="block" />
        ) : cycle == null ? (
          <>
            <Text tone="secondary" size="sm">
              Открытого сбора нет: покупатели видят каталог, но оформить заявку не могут.
            </Text>
            <Button link={{ href: '/admin/cycles' }}>Назначить дедлайн</Button>
          </>
        ) : (
          <>
            <div className={styles.cycleHead}>
              <Text weight="medium">{cycle.label ?? 'Без подписи'}</Text>
              <Badge tone="brand" withDot={true}>
                до {formatDateTime(cycle.deadlineAt)}
              </Badge>
            </div>

            <DeadlineCountdown deadlineAt={cycle.deadlineAt} />
            <Button variant="secondary" link={{ href: '/admin/cycles' }}>
              Открыть календарь
            </Button>
          </>
        )}
      </section>

      <section className={styles.panel}>
        {/*
          Пока сбор не пришёл, показывать «Заявки за всё время» рано —
          заголовок соврал бы на каждой загрузке.
        */}
        <Text weight="semibold">
          {isCycleLoading ? 'Заявки' : cycle == null ? 'Заявки за всё время' : 'Заявки текущего сбора'}
        </Text>

        {isLoading ? (
          <Skeleton height={72} shape="block" />
        ) : (
          <div className={styles.counters}>
            {STATUSES.map(status => (
              <div key={status} className={styles.counter}>
                {/* Прочерк, а не ноль: неизвестное число нельзя рисовать как «ни одной». */}
                <span className={styles.counterValue}>{counts?.[status] ?? '—'}</span>
                <span className={styles.counterLabel}>{orderStatusLabel(status)}</span>
              </div>
            ))}
          </div>
        )}

        <Button variant="secondary" link={{ href: '/admin/orders' }}>
          Все заявки
        </Button>
      </section>
    </AdminShell>
  )
}

export default AdminOverviewPage
