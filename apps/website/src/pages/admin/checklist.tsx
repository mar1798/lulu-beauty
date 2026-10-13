import React, { useMemo } from 'react'
import useSWR from 'swr'
import type { IAdminChecklist, IChecklistItem } from 'widgets/types'
import { Alert, Button } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminChecklist } from 'widgets/organisms'
import { useConfirm } from 'widgets/contexts'
import { formatDate } from 'widgets/utils'
import { AdminShell } from '@/layouts/AdminShell'
import { useChecklistMarks } from '@/hooks/useChecklistMarks'
import { messageForError } from '@/services/apiErrors'
import { getAdminChecklist } from '@/services/endpoints/admin'
import { adminChecklistKey } from '@/services/swrKeys'

/**
 * Чек-лист закупки: все товары открытого сбора, а без открытого — последнего
 * закрытого, по строке на объём. Владелец ходит с ним по магазину и отмечает
 * купленное — почти всегда с телефона, поэтому на странице только таблица.
 *
 * Отметки хранятся в браузере (`useChecklistMarks`) и привязаны к сбору.
 */

/**
 * Ключ строки — то же, по чему бэкенд её группирует: название, объём и цена.
 * Количество в ключ не входит намеренно: отменённая после покупки заявка
 * уменьшает число, и снятая из-за этого отметка заставила бы перепроверять
 * уже купленное.
 */
const itemKey = (item: IAdminChecklist['items'][number]): string =>
  `${item.productName}|${item.volumeMl ?? ''}|${item.unitPriceCents}`

const cycleSummary = (cycle: NonNullable<IAdminChecklist['cycle']>): string => {
  const name = cycle.label ?? 'Без подписи'
  const deadline = formatDate(cycle.deadlineAt)

  // Дата идёт последней и без точки после: `formatDate` сам заканчивается на «г.».
  return cycle.isActive
    ? `Отменённые заявки в список не входят. Сбор «${name}», до ${deadline}`
    : `Открытого сбора нет - список последнего: «${name}», ${deadline}`
}

const AdminChecklistPage: React.FC = () => {
  const { confirm } = useConfirm()
  const { data, error: fetchError } = useSWR(adminChecklistKey, () => getAdminChecklist())

  const cycle = data?.cycle ?? null
  const { checkedKeys, toggle, reset } = useChecklistMarks(cycle?.id ?? null)

  const items = useMemo<IChecklistItem[]>(
    () => (data?.items ?? []).map(item => ({ ...item, key: itemKey(item) })),
    [data]
  )

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.checklist')
  const hasMarks = items.some(item => checkedKeys.includes(item.key))

  const handleReset = async (): Promise<void> => {
    const confirmed = await confirm({
      title: 'Снять все отметки?',
      description: 'Все строки снова станут неотмеченными. Сам список не изменится.',
      confirmLabel: 'Снять',
    })

    if (confirmed) {
      reset()
    }
  }

  return (
    <AdminShell
      title="Чек-лист"
      summary={cycle === null ? undefined : cycleSummary(cycle)}
      actions={
        hasMarks ? (
          <Button
            variant="secondary"
            size="sm"
            isFullWidth="mobile"
            onClick={() => {
              void handleReset()
            }}
          >
            Снять отметки
          </Button>
        ) : undefined
      }
    >
      {error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )}

      <AdminChecklist
        items={items}
        checkedKeys={checkedKeys}
        onToggle={toggle}
        buildProductHref={slug => `/catalog/${slug}`}
        isLoading={data === undefined && error === null}
        emptyState={
          error === null && (
            <EmptyState
              title={cycle === null ? 'Сборов ещё не было' : 'Заявок нет'}
              description={
                cycle === null
                  ? 'Список появится, когда откроется первый сбор и придут заявки.'
                  : 'В этом сборе пока нет ни одной заявки - покупать нечего.'
              }
            />
          )
        }
      />
    </AdminShell>
  )
}

export default AdminChecklistPage
