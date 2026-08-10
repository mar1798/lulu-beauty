import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { GetServerSideProps } from 'next'
import type { IAdminOrder, IOrderCycle, ISelectOption, OrderStatus } from 'widgets/types'
import { Alert, Button, Select } from 'widgets/atoms'
import { EmptyState, Pagination, orderStatusLabel } from 'widgets/molecules'
import { AdminOrdersTable } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { formatDate } from 'widgets/utils'
import { IconDownload } from 'widgets/svg'
import { AdminShell } from '@/layouts/AdminShell'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import {
  deleteOrder,
  listAdminOrders,
  listCycles,
  updateOrderStatus,
} from '@/services/endpoints/admin'
import { downloadOrdersExport } from '@/services/endpoints/export'
import { adminOrdersKey, cyclesKey, isAdminOverviewKey } from '@/services/swrKeys'
import * as styles from '@/styles/admin.css'

/**
 * Заявки покупателей: фильтр по сбору и статусу, смена статуса, выгрузка.
 *
 * Выгрузка качается через `fetch`, а не обычной ссылкой: ручка админская,
 * и отказ (403, 500) на ссылке превратился бы в скачанный файл с текстом
 * ошибки внутри. Имя файла берётся из `Content-Disposition` — там RFC 5987,
 * то есть кириллица в имени переживает прокси.
 */

const PAGE_SIZE = 20
const ALL = ''

const STATUS_OPTIONS: ISelectOption[] = [
  { value: ALL, label: 'Любой статус' },
  ...(['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'] as OrderStatus[]).map(
    status => ({ value: status, label: orderStatusLabel(status) })
  ),
]

const cycleLabel = (cycle: IOrderCycle): string =>
  `${cycle.label ?? 'Без подписи'} — ${formatDate(cycle.deadlineAt)}`

const AdminOrdersPage: React.FC<IAdminPageProps> = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [cycleId, setCycleId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const {
    data,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR(
    adminOrdersKey(cycleId, status, page),
    () =>
      listAdminOrders({
        cycleId: cycleId === ALL ? undefined : cycleId,
        status: status === ALL ? undefined : (status as OrderStatus),
        page,
        pageSize: PAGE_SIZE,
      }),
    // Смена фильтра/страницы не должна сбрасывать таблицу в скелетон.
    { keepPreviousData: true }
  )

  // Общий ключ со «Сборами» (`/admin/cycles`): список в фильтре не отстаёт от календаря.
  const { data: cycles } = useSWR(cyclesKey, () => listCycles())

  const error =
    fetchError === undefined
      ? null
      : isApiError(fetchError)
        ? fetchError.message
        : 'Не удалось загрузить заявки.'

  const handleStatusChange = async (order: IAdminOrder, next: OrderStatus): Promise<void> => {
    setBusyId(order.id)
    setActionError(null)

    try {
      await updateOrderStatus(order.id, next)
      notify({ tone: 'success', title: 'Статус изменён', description: orderStatusLabel(next) })
      await mutate()
      void globalMutate(isAdminOverviewKey)
    } catch (cause: unknown) {
      const message = isApiError(cause) ? cause.message : 'Не удалось изменить статус.'

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (order: IAdminOrder): Promise<void> => {
    const confirmed = await confirm({
      title: 'Удалить заявку?',
      description:
        'Заявка исчезнет вместе с составом и не попадёт в выгрузки. Если покупатель просто передумал, ему хватит отмены — там заявка остаётся видна.',
      confirmLabel: 'Удалить',
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    setBusyId(order.id)
    setActionError(null)

    try {
      await deleteOrder(order.id)
      notify({ tone: 'success', title: 'Заявка удалена' })
      await mutate()
      void globalMutate(isAdminOverviewKey)
    } catch (cause: unknown) {
      const message = isApiError(cause) ? cause.message : 'Не удалось удалить заявку.'

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setBusyId(null)
    }
  }

  const handleExport = async (): Promise<void> => {
    setIsExporting(true)
    setActionError(null)

    try {
      const { blob, filename } = await downloadOrdersExport(cycleId === ALL ? undefined : cycleId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = filename ?? 'orders.xlsx'
      document.body.append(link)
      link.click()
      link.remove()
      // Отзываем сразу: браузер уже забрал содержимое, а ссылка держала бы blob в памяти.
      URL.revokeObjectURL(url)
    } catch (cause: unknown) {
      const message = isApiError(cause) ? cause.message : 'Не удалось выгрузить заявки.'

      setActionError(message)
      notify({ tone: 'danger', title: 'Выгрузка не выполнена', description: message })
    } finally {
      setIsExporting(false)
    }
  }

  const cycleOptions: ISelectOption[] = [
    { value: ALL, label: 'Все сборы' },
    ...(cycles ?? []).map(cycle => ({ value: cycle.id, label: cycleLabel(cycle) })),
  ]

  return (
    <AdminShell
      title="Заявки"
      summary="Состав и цены — снимок на момент оформления, они не меняются вслед за каталогом."
      actions={
        <Button
          variant="secondary"
          iconStart={<IconDownload />}
          isLoading={isExporting}
          onClick={() => {
            void handleExport()
          }}
        >
          Выгрузить в Excel
        </Button>
      }
    >
      <div className={styles.filtersWide}>
        <Select
          label="Сбор"
          value={cycleId}
          options={cycleOptions}
          onChange={next => {
            setCycleId(next)
            setPage(1)
          }}
        />

        <Select
          label="Статус"
          value={status}
          options={STATUS_OPTIONS}
          onChange={next => {
            setStatus(next)
            setPage(1)
          }}
        />
      </div>

      {(error ?? actionError) !== null && (
        <Alert tone="danger" title="Не получилось">
          {error ?? actionError}
        </Alert>
      )}

      <AdminOrdersTable
        orders={data?.items ?? []}
        isLoading={isLoading}
        busyId={busyId}
        buildProductHref={slug => `/catalog/${slug}`}
        onStatusChange={(order, next) => {
          void handleStatusChange(order, next)
        }}
        onDelete={order => {
          void handleDelete(order)
        }}
        emptyState={
          <EmptyState
            title="Заявок нет"
            description="С выбранными фильтрами ничего не нашлось. Попробуйте выбрать другой сбор или статус."
          />
        }
      />

      {data !== undefined && data.total > PAGE_SIZE && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
      )}
    </AdminShell>
  )
}

export const getServerSideProps: GetServerSideProps<IAdminPageProps> = async context => {
  const gate = await requireAdmin<IAdminPageProps>(context)

  return gate.redirect ?? { props: { user: gate.user } }
}

export default AdminOrdersPage
