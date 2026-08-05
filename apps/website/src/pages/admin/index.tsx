import React, { useMemo } from 'react'
import type { GetServerSideProps } from 'next'
import type { IOrderCycle, OrderStatus } from 'widgets/types'
import { Alert, Badge, Button, Skeleton, Text } from 'widgets/atoms'
import { DeadlineCountdown, orderStatusLabel } from 'widgets/molecules'
import { formatDateTime } from 'widgets/utils'
import { AdminShell } from '@/layouts/AdminShell'
import { useAuthedRequest } from '@/hooks/useAuthedRequest'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { listAdminOrders } from '@/services/endpoints/admin'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import * as styles from '@/styles/admin.css'

/**
 * Обзор: текущий сбор и сколько заявок в каком статусе.
 *
 * Счётчики берутся из `total` пагинации (`pageSize: 1`), а не пересчётом
 * загруженных заявок: на второй странице список уже неполон, и «12 заявок»
 * превратилось бы в «20 на этой странице». Пять коротких запросов дешевле
 * выкачивания всех заявок ради счёта.
 */

const STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED']

interface IOverview {
  cycle: IOrderCycle | null
  counts: Record<OrderStatus, number>
}

const loadOverview = async (): Promise<IOverview> => {
  const cycle = await getActiveCycleOrNull()
  const totals = await Promise.all(
    STATUSES.map(status =>
      listAdminOrders({ status, cycleId: cycle?.id, pageSize: 1 }).then(page => page.total)
    )
  )

  return {
    cycle,
    counts: Object.fromEntries(
      STATUSES.map((status, index) => [status, totals[index]])
    ) as Record<OrderStatus, number>,
  }
}

const AdminOverviewPage: React.FC<IAdminPageProps> = ({ user }) => {
  const load = useMemo(() => loadOverview, [])
  const { data, isLoading, error } = useAuthedRequest(load, 'Не удалось загрузить сводку.')

  return (
    <AdminShell title="Обзор" summary={`Вы вошли как ${user.name}.`}>
      {error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )}

      <section className={styles.panel}>
        <Text weight="semibold">Текущий сбор</Text>

        {isLoading ? (
          <Skeleton height={72} shape="block" />
        ) : data?.cycle == null ? (
          <>
            <Text tone="secondary" size="sm">
              Открытого сбора нет: покупатели видят каталог, но оформить заявку не могут.
            </Text>
            <Button link={{ href: '/admin/cycles' }}>Назначить дедлайн</Button>
          </>
        ) : (
          <>
            <div className={styles.cycleHead}>
              <Text weight="medium">{data.cycle.label ?? 'Без подписи'}</Text>
              <Badge tone="brand" withDot={true}>
                до {formatDateTime(data.cycle.deadlineAt)}
              </Badge>
            </div>

            <DeadlineCountdown deadlineAt={data.cycle.deadlineAt} />
            <Button variant="secondary" link={{ href: '/admin/cycles' }}>
              Открыть календарь
            </Button>
          </>
        )}
      </section>

      <section className={styles.panel}>
        {/*
          Пока данные не пришли, `data` — `null`, и «нет сбора» от «ещё не
          знаем» неотличимо: без этой ветки заголовок успевал соврать
          «Заявки за всё время» на каждой загрузке.
        */}
        <Text weight="semibold">
          {isLoading
            ? 'Заявки'
            : data?.cycle == null
              ? 'Заявки за всё время'
              : 'Заявки текущего сбора'}
        </Text>

        {isLoading ? (
          <Skeleton height={72} shape="block" />
        ) : (
          <div className={styles.counters}>
            {STATUSES.map(status => (
              <div key={status} className={styles.counter}>
                <span className={styles.counterValue}>{data?.counts[status] ?? 0}</span>
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

export const getServerSideProps: GetServerSideProps<IAdminPageProps> = async context => {
  const gate = await requireAdmin<IAdminPageProps>(context)

  return gate.redirect ?? { props: { user: gate.user } }
}

export default AdminOverviewPage
