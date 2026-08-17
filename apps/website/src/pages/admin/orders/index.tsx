import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminOrder, IOrderCycle, ISelectOption, OrderStatus } from 'widgets/types'
import { Alert, Button, Select, Switch } from 'widgets/atoms'
import { EmptyState, ORDER_STATUSES, Pagination, orderStatusLabel } from 'widgets/molecules'
import { AdminOrdersTable } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { formatDate } from 'widgets/utils'
import { IconDownload } from 'widgets/svg'
import { AdminShell } from '@/layouts/AdminShell'
import { useActiveCycle } from '@/hooks/useActiveCycle'
import { messageForError } from '@/services/apiErrors'
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
 * Выгрузка — сводный лист закупки: одна строка на товар, количество
 * просуммировано по всем заявкам, попавшим под текущие фильтры (сбор и
 * статус), плюс итоговая строка. Фильтры уходят в выгрузку теми же, что
 * стоят над таблицей.
 *
 * Тумблер «Цены в файле» убирает из листа колонки цены и суммы: тот же файл
 * часто пересылают поставщику, и наши цены там лишние. Без цен строки одного
 * товара, купленного по разной цене, бэк сливает в одну — иначе в листе стояли
 * бы две неотличимые.
 *
 * Качается через `fetch`, а не обычной ссылкой: ручка админская,
 * и отказ (403, 500) на ссылке превратился бы в скачанный файл с текстом
 * ошибки внутри. Имя файла берётся из `Content-Disposition` — там RFC 5987,
 * то есть кириллица в имени переживает прокси.
 */

const PAGE_SIZE = 20
const ALL = ''

const STATUS_OPTIONS: ISelectOption[] = [
  { value: ALL, label: 'Любой статус' },
  // Обе отмены — отдельными пунктами: владельцу нужно уметь отобрать именно те,
  // от которых отказался покупатель.
  ...ORDER_STATUSES.map(status => ({ value: status, label: orderStatusLabel(status) })),
]

const cycleLabel = (cycle: IOrderCycle): string =>
  `${cycle.label ?? 'Без подписи'} — ${formatDate(cycle.deadlineAt)}`

/**
 * Какой сбор стоит в фильтре при первом открытии страницы: открытый сейчас, а
 * если открытого нет — последний закрытый. «Все сборы» остаются доступны, но
 * только явным выбором: по умолчанию владельцу нужен текущий сбор, а не вся
 * история заявок вперемешку.
 *
 * `list` на бэкенде отдаёт сборы по возрастанию дедлайна, поэтому последний
 * закрытый — последний в отфильтрованном списке.
 */
const defaultCycleId = (cycles: IOrderCycle[], active: IOrderCycle | null): string => {
  if (active !== null) {
    return active.id
  }

  return cycles.filter(cycle => cycle.status === 'CLOSED').at(-1)?.id ?? ALL
}

const AdminOrdersPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  /*
    Выбор владельца, а не действующий фильтр: пока он ничего не выбрал (`null`),
    фильтр берётся по умолчанию — текущим сбором (см. `cycleId` ниже). Явно
    выбранные «Все сборы» — это `ALL`, и умолчание его уже не перебьёт.
  */
  const [chosenCycleId, setChosenCycleId] = useState<string | null>(null)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  /*
    Цены в выгрузке. По умолчанию включены — это закупка самого владельца.
    Выключаются, когда тот же лист уходит поставщику: наши цены ему знать
    незачем. Состояние живёт только на странице — на таблицу оно не влияет,
    ключ SWR от него не зависит, перезапрашивать нечего.
  */
  const [includePrices, setIncludePrices] = useState(true)

  // Общий ключ со «Сборами» (`/admin/cycles`): список в фильтре не отстаёт от календаря.
  const { data: cycles } = useSWR(cyclesKey, () => listCycles())

  /*
    Открытый сбор берём у той же ручки, что и витрина, а не вычисляем по
    статусу из списка: статус переставляет планировщик, и только что созданный
    сбор ещё числится `UPCOMING`, хотя приём заявок по нему уже идёт.
  */
  const { cycle: activeCycle, isLoading: isActiveCycleLoading } = useActiveCycle()

  /*
    Действующий фильтр: выбор владельца, а до него — умолчание. `null` значит
    «ещё не знаем»: списки не приехали, и запрашивать заявки не за что.
  */
  const cycleId =
    chosenCycleId ??
    (cycles === undefined || isActiveCycleLoading ? null : defaultCycleId(cycles, activeCycle))

  /** Фильтр в том виде, в каком его понимает API: `undefined` — «все сборы». */
  const cycleFilter = cycleId === null || cycleId === ALL ? undefined : cycleId

  const {
    data,
    error: fetchError,
    mutate,
  } = useSWR(
    // Пока сбор не выбран, запроса нет: иначе первая выдача пришла бы за все сборы.
    cycleId === null ? null : adminOrdersKey(cycleId, status, page),
    () =>
      listAdminOrders({
        cycleId: cycleFilter,
        status: status === ALL ? undefined : (status as OrderStatus),
        page,
        pageSize: PAGE_SIZE,
      }),
    // Смена фильтра/страницы не должна сбрасывать таблицу в скелетон.
    { keepPreviousData: true }
  )

  /*
    Скелетон — только пока показывать нечего. `isLoading` из SWR считается по
    текущему ключу и на смене фильтра становится `true` даже с
    `keepPreviousData`, из-за чего таблица мигала скелетоном на каждый клик.
  */
  const isFirstLoad = data === undefined

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.orders')

  const handleStatusChange = async (order: IAdminOrder, next: OrderStatus): Promise<void> => {
    setBusyId(order.id)
    setActionError(null)

    try {
      await updateOrderStatus(order.id, next)
      notify({ tone: 'success', title: 'Статус изменён', description: orderStatusLabel(next) })
      await mutate()
      void globalMutate(isAdminOverviewKey)
    } catch (cause: unknown) {
      const message = messageForError(cause, 'admin.orders')

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
      const message = messageForError(cause, 'admin.orders')

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
      const { blob, filename } = await downloadOrdersExport({
        cycleId: cycleFilter,
        status: status === ALL ? undefined : (status as OrderStatus),
        includePrices,
      })
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
      const message = messageForError(cause, 'admin.export')

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
        <div className={styles.row}>
          <Switch
            label="Цены в файле"
            checked={includePrices}
            disabled={isExporting}
            onChange={setIncludePrices}
          />

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
        </div>
      }
    >
      <div className={styles.filtersWide}>
        <Select
          label="Сбор"
          value={cycleId ?? ALL}
          options={cycleOptions}
          onChange={next => {
            setChosenCycleId(next)
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
        isLoading={isFirstLoad}
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

export default AdminOrdersPage
