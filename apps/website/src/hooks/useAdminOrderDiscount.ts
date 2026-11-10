import { useCallback, useState } from 'react'
import { mutate as globalMutate } from 'swr'
import type {
  IAdminOrder,
  IAdminOrderDiscountDialogProps,
  IAdminOrderDiscountInput,
} from 'widgets/types'
import { formatPrice } from 'widgets/atoms'
import { useConfirm, useToast } from 'widgets/contexts'
import { adminOrderNumber } from 'widgets/organisms'
import { formatDiscount, formatVariant, totalWithDiscount } from 'widgets/utils'
import { isApiError, messageForError } from '@/services/apiErrors'
import { setAdminOrderDiscount } from '@/services/endpoints/admin'
import { isAdminOrdersKey, isAdminOverviewKey } from '@/services/swrKeys'

/**
 * Скидка на чужую заявку из админки — всё состояние окна «Скидка»
 * (`AdminOrderDiscountDialog`).
 *
 * Окно только собирает скидку; прежде чем она уйдёт, здесь спрашивается
 * подтверждение с итогом — на что, сколько и какая станет сумма: покупатель
 * узнает о скидке сразу, сообщением бота, и отозвать то сообщение нельзя.
 * Снятие скидки подтверждается так же.
 *
 * Вместе со скидкой уходит `revision` заявки, с которой окно открыли: если
 * состав успели поменять, сумма в подтверждении была бы уже не той, и бэкенд
 * откажет `order_changed`. Таблица после этого перечитывается, и `sync`
 * подменяет заявку в окне свежей — следующее подтверждение покажет верную сумму.
 */

interface IAdminOrderDiscount {
  /** Пропсы окна целиком — страница только раскладывает их в `AdminOrderDiscountDialog`. */
  dialog: IAdminOrderDiscountDialogProps
  open: (order: IAdminOrder) => void
  /**
   * Свежие заявки из таблицы. Если открытую в окне успели изменить, окно берёт
   * новую версию — сумма и `revision` в нём становятся текущими, и повтор после
   * `order_changed` проходит без переоткрытия. Набранное в окне остаётся.
   */
  sync: (orders: readonly IAdminOrder[]) => void
}

/**
 * «на всю заявку» или «на «Помада Velvet, 05 Rose»» — для текста подтверждения.
 * С вариантом, как в окне: две строки одной помады различаются только тоном.
 */
const targetLabel = (order: IAdminOrder, itemId: string | null): string => {
  if (itemId === null) {
    return 'на всю заявку'
  }

  const item = order.items.find(line => line.id === itemId)

  if (item === undefined) {
    return 'на позицию'
  }

  const variant = formatVariant(item.productVolumeMl, item.productShade)

  return `на «${item.productName}${variant === null ? '' : `, ${variant}`}»`
}

export const useAdminOrderDiscount = (): IAdminOrderDiscount => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [isOpen, setIsOpen] = useState(false)
  const [order, setOrder] = useState<IAdminOrder | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (
    current: IAdminOrder,
    itemId: string | null,
    discount: Omit<IAdminOrderDiscountInput, 'itemId'> | null
  ): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const saved = await setAdminOrderDiscount(current.id, {
        revision: current.revision,
        itemId,
        discount,
      })

      notify({
        tone: 'success',
        title: discount === null ? 'Скидка снята' : 'Скидка сохранена',
        description: `№ ${adminOrderNumber(saved.id)} - ${formatPrice(saved.totalCents)}`,
      })
      setOrder(saved)
      setIsOpen(false)
      // Сумма меняет таблицу и итог сводки; лист закупки скидки не трогают.
      void globalMutate(isAdminOrdersKey)
      void globalMutate(isAdminOverviewKey)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.order.discount'))

      // Заявка в таблице устарела: перечитываем, чтобы повторное открытие взяло свежую.
      if (
        isApiError(cause) &&
        (cause.code === 'order_changed' ||
          cause.code === 'order_not_discountable' ||
          cause.code === 'order_item_not_found' ||
          cause.code === 'order_not_found')
      ) {
        void globalMutate(isAdminOrdersKey)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const submit = async (input: IAdminOrderDiscountInput): Promise<void> => {
    if (order === null || isSubmitting) {
      return
    }

    const after = totalWithDiscount(order, {
      itemId: input.itemId,
      kind: input.kind,
      value: input.value,
    })
    const reach = order.canMessage
      ? 'Покупатель сразу получит сообщение в боте со скидкой, причиной и новой суммой.'
      : 'Покупатель не привязан к боту - сообщение ему не придёт.'

    const confirmed = await confirm({
      title: 'Дать скидку?',
      description: [
        `Скидка ${formatDiscount(input.kind, input.value)} ${targetLabel(order, input.itemId)}`,
        `в заявке № ${adminOrderNumber(order.id)}.`,
        `Сумма: ${formatPrice(order.totalCents)} → ${formatPrice(after)}.`,
        input.note === null ? 'Причина не указана.' : `Причина: ${input.note}.`,
        reach,
      ].join(' '),
      confirmLabel: 'Дать скидку',
      cancelLabel: 'Вернуться',
      tone: 'primary',
    })

    if (confirmed) {
      await save(order, input.itemId, { kind: input.kind, value: input.value, note: input.note })
    }
  }

  const remove = async (itemId: string | null): Promise<void> => {
    if (order === null || isSubmitting) {
      return
    }

    const after = totalWithDiscount(order, { itemId, kind: null, value: null })

    const confirmed = await confirm({
      title: 'Снять скидку?',
      description: [
        `Скидка ${targetLabel(order, itemId)} в заявке № ${adminOrderNumber(order.id)} будет снята.`,
        `Сумма: ${formatPrice(order.totalCents)} → ${formatPrice(after)}.`,
        order.canMessage ? 'Покупатель получит сообщение в боте.' : '',
      ]
        .filter(part => part !== '')
        .join(' '),
      confirmLabel: 'Снять скидку',
      cancelLabel: 'Вернуться',
      tone: 'danger',
    })

    if (confirmed) {
      await save(order, itemId, null)
    }
  }

  const sync = useCallback(
    (orders: readonly IAdminOrder[]): void => {
      if (!isOpen || order === null) {
        return
      }

      const fresh = orders.find(candidate => candidate.id === order.id)

      if (fresh !== undefined && fresh.revision !== order.revision) {
        setOrder(fresh)
      }
    },
    [isOpen, order]
  )

  return {
    sync,
    open: next => {
      setOrder(next)
      setError(null)
      setIsOpen(true)
    },
    dialog: {
      isOpen,
      onClose: () => {
        if (!isSubmitting) {
          // Заявку не сбрасываем: окно уезжает с анимацией, и шапка не должна мигнуть.
          setIsOpen(false)
        }
      },
      order,
      isBusy: isSubmitting,
      error,
      onSubmit: input => {
        void submit(input)
      },
      onRemove: itemId => {
        void remove(itemId)
      },
    },
  }
}
