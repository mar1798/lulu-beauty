import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import type { IAdminChecklist, IChecklistExtraInput, IChecklistItem } from 'widgets/types'
import { Alert, Button } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminChecklist, AdminChecklistExtraDialog } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { IconPlus } from 'widgets/svg'
import { formatDate } from 'widgets/utils'
import { AdminShell } from '@/layouts/AdminShell'
import { useChecklistMarks } from '@/hooks/useChecklistMarks'
import { messageForError } from '@/services/apiErrors'
import {
  addChecklistExtra,
  deleteChecklistExtra,
  getAdminChecklist,
} from '@/services/endpoints/admin'
import { adminChecklistKey } from '@/services/swrKeys'

/**
 * Чек-лист закупки: все товары открытого сбора, а без открытого — последнего
 * закрытого, по строке на объём. Владелец ходит с ним по магазину и отмечает
 * купленное — почти всегда с телефона, поэтому на странице только таблица.
 *
 * Отметки «куплено» — на сервере, у сбора, и общие для всех админов
 * (`useChecklistMarks`). Чтобы отметки соседа появлялись без перезагрузки,
 * список перечитывается раз в `REFRESH_INTERVAL_MS`, пока вкладка на экране.
 * Тумблер «Скрыть купленное» оставляет в таблице только то, что ещё купить.
 *
 * Кроме строк из заявок, владелец добавляет свои пункты — «Добавить пункт»:
 * название, количество и цена (по умолчанию 0). Они хранятся на сервере, у
 * сбора, и удаляются корзиной в строке.
 */

/**
 * Ключ строки — то же, по чему бэкенд её группирует: название, объём, тон и цена.
 * Количество в ключ не входит намеренно: отменённая после покупки заявка
 * уменьшает число, и снятая из-за этого отметка заставила бы перепроверять
 * уже купленное.
 */
const itemKey = (item: IAdminChecklist['items'][number]): string =>
  // Свой пункт узнаётся по id: название и цену у двух таких строк ничто не
  // мешает сделать одинаковыми.
  item.extraId !== undefined && item.extraId !== null
    ? `extra|${item.extraId}`
    : `${item.productName}|${item.volumeMl ?? ''}|${item.unitPriceCents}${
        // Тон — хвостом и только когда он есть: ключи строк без тона остаются
        // прежними, и отметки «куплено», сделанные до тонов, не слетают.
        item.shade ? `|${item.shade}` : ''
      }`

/**
 * Как часто подтягивать чужие отметки. Десяти секунд хватает, чтобы двое в
 * одном магазине не купили одно и то же дважды, а запрос лёгкий. Скрытая
 * вкладка не опрашивает (`refreshWhenHidden` в SWR выключен по умолчанию).
 */
const REFRESH_INTERVAL_MS = 10_000

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
  const { notify } = useToast()
  const {
    data,
    error: fetchError,
    mutate,
  } = useSWR(adminChecklistKey, () => getAdminChecklist(), {
    refreshInterval: REFRESH_INTERVAL_MS,
  })
  const [isExtraOpen, setIsExtraOpen] = useState(false)
  const [isExtraBusy, setIsExtraBusy] = useState(false)
  const [extraError, setExtraError] = useState<string | null>(null)
  const [hideChecked, setHideChecked] = useState(false)

  const cycle = data?.cycle ?? null
  const { checkedKeys, toggle, reset } = useChecklistMarks(data, mutate)

  const items = useMemo<IChecklistItem[]>(
    () => (data?.items ?? []).map(item => ({ ...item, key: itemKey(item) })),
    [data]
  )

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.checklist')
  const hasMarks = items.some(item => checkedKeys.includes(item.key))

  const notifyMarkError = (cause: unknown): void => {
    notify({
      tone: 'danger',
      title: 'Отметка не сохранилась',
      description: messageForError(cause, 'admin.checklist.mark'),
    })
  }

  const handleToggle = (key: string, checked: boolean): void => {
    toggle(key, checked).catch(notifyMarkError)
  }

  const handleReset = async (): Promise<void> => {
    const confirmed = await confirm({
      title: 'Снять все отметки?',
      description:
        'Все строки снова станут неотмеченными - у всех админов. Сам список не изменится.',
      confirmLabel: 'Снять',
    })

    if (confirmed) {
      reset().catch(notifyMarkError)
    }
  }

  const handleAddExtra = async (input: IChecklistExtraInput): Promise<void> => {
    if (cycle === null) {
      return
    }

    setIsExtraBusy(true)
    setExtraError(null)

    try {
      await addChecklistExtra(cycle.id, input)
      setIsExtraOpen(false)
      await mutate()
    } catch (cause: unknown) {
      setExtraError(messageForError(cause, 'admin.checklist.extra'))
    } finally {
      setIsExtraBusy(false)
    }
  }

  const handleRemoveExtra = async (item: IChecklistItem): Promise<void> => {
    if (item.extraId === undefined || item.extraId === null) {
      return
    }

    const confirmed = await confirm({
      title: 'Удалить пункт?',
      description: `«${item.productName}» исчезнет из чек-листа.`,
      confirmLabel: 'Удалить',
      tone: 'danger',
    })

    if (!confirmed) {
      return
    }

    try {
      await deleteChecklistExtra(item.extraId)
      await mutate()
    } catch (cause: unknown) {
      notify({
        tone: 'danger',
        title: 'Не получилось',
        description: messageForError(cause, 'admin.checklist.extra'),
      })
    }
  }

  return (
    <AdminShell
      title="Чек-лист"
      summary={cycle === null ? undefined : cycleSummary(cycle)}
      actions={
        // Без сбора и без отметок кнопок нет вовсе — и пустой полки под заголовком тоже.
        !hasMarks && cycle === null ? undefined : (
          <>
            {hasMarks && (
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
            )}
            {/* Пункту нужен сбор: в магазине без сборов добавлять некуда. */}
            {cycle !== null && (
              <Button
                size="sm"
                isFullWidth="mobile"
                iconStart={<IconPlus />}
                onClick={() => {
                  setExtraError(null)
                  setIsExtraOpen(true)
                }}
              >
                Добавить пункт
              </Button>
            )}
          </>
        )
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
        onToggle={handleToggle}
        hideChecked={hideChecked}
        onHideCheckedChange={setHideChecked}
        onRemoveExtra={item => {
          void handleRemoveExtra(item)
        }}
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

      <AdminChecklistExtraDialog
        isOpen={isExtraOpen}
        isBusy={isExtraBusy}
        error={extraError}
        onSubmit={input => {
          void handleAddExtra(input)
        }}
        onClose={() => {
          setIsExtraOpen(false)
        }}
      />
    </AdminShell>
  )
}

export default AdminChecklistPage
