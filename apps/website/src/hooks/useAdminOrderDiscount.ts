import { useCallback, useEffect, useState } from 'react'
import { mutate as globalMutate } from 'swr'
import type {
  IAdminOrder,
  IAdminOrderDiscountDialogProps,
  IAdminOrderDiscountDraft,
  IAdminOrderDiscountInput,
  IAdminOrderDiscountPreview,
} from 'widgets/types'
import { formatPrice } from 'widgets/atoms'
import { useConfirm, useToast } from 'widgets/contexts'
import { adminOrderNumber } from 'widgets/organisms'
import { formatDiscount, formatVariant } from 'widgets/utils'
import { isApiError, messageForError } from '@/services/apiErrors'
import { previewAdminOrderDiscount, setAdminOrderDiscount } from '@/services/endpoints/admin'
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
 *
 * Сумму со скидкой фронтенд не считает: и в окне, пока админ набирает, и в
 * подтверждении её отдаёт `POST .../discount/preview` — тот же код бэкенда,
 * что сохраняет, только без сохранения. Отказы («больше суммы», «округлилась
 * до нуля») приходят оттуда же и показываются у поля.
 */

/** Пауза после последнего нажатия, прежде чем спрашивать бэкенд. */
const PREVIEW_DELAY_MS = 250

const NO_PREVIEW: IAdminOrderDiscountPreview = { totalCents: null, error: null, isPending: false }

/** Ответы, после которых заявка в таблице устарела и её надо перечитать. */
const isStale = (cause: unknown): boolean =>
  isApiError(cause) &&
  (cause.code === 'order_changed' ||
    cause.code === 'order_not_discountable' ||
    cause.code === 'order_item_not_found' ||
    cause.code === 'order_not_found')

type IDiscountBody = Omit<IAdminOrderDiscountInput, 'itemId'> | null

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
  const [draft, setDraft] = useState<IAdminOrderDiscountDraft | null>(null)
  /** Последний ответ бэкенда — с ключом набранного, на которое он отвечал. */
  const [answer, setAnswer] = useState<{
    key: string
    preview: IAdminOrderDiscountPreview
  } | null>(null)

  // Ключ набранного вместе с версией заявки: свежая заявка — и прежний ответ уже не про неё.
  const draftKey =
    !isOpen || order === null || draft === null
      ? null
      : JSON.stringify([order.id, order.revision, draft.itemId, draft.kind, draft.value])

  const preview: IAdminOrderDiscountPreview =
    draftKey === null
      ? NO_PREVIEW
      : answer?.key === draftKey
        ? answer.preview
        : { ...NO_PREVIEW, isPending: true }

  // Набранная скидка — бэкенду на расчёт, с паузой: не на каждую цифру.
  useEffect(() => {
    if (draftKey === null || order === null || draft === null) {
      return
    }

    let isCurrent = true

    const timer = setTimeout(() => {
      previewAdminOrderDiscount(order.id, {
        revision: order.revision,
        itemId: draft.itemId,
        discount: { kind: draft.kind, value: draft.value, note: null },
      })
        .then(result => {
          if (isCurrent) {
            setAnswer({
              key: draftKey,
              preview: { totalCents: result.totalCents, error: null, isPending: false },
            })
          }
        })
        .catch((cause: unknown) => {
          if (!isCurrent) {
            return
          }

          setAnswer({
            key: draftKey,
            preview: {
              totalCents: null,
              error: messageForError(cause, 'admin.order.discount'),
              isPending: false,
            },
          })

          if (isStale(cause)) {
            void globalMutate(isAdminOrdersKey)
          }
        })
    }, PREVIEW_DELAY_MS)

    return () => {
      isCurrent = false
      clearTimeout(timer)
    }
    // `draftKey` и есть заявка с набранным — по нему и перезапрашиваем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  /**
   * Сумма заявки после скидки — для текста подтверждения, у бэкенда и заново:
   * в окне мог остаться ответ на прошлое набранное. `null` — отказ, его текст
   * уже в окне.
   */
  const quote = async (
    current: IAdminOrder,
    itemId: string | null,
    discount: IDiscountBody
  ): Promise<number | null> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await previewAdminOrderDiscount(current.id, {
        revision: current.revision,
        itemId,
        discount,
      })

      return result.totalCents
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.order.discount'))

      if (isStale(cause)) {
        void globalMutate(isAdminOrdersKey)
      }

      return null
    } finally {
      setIsSubmitting(false)
    }
  }

  const save = async (
    current: IAdminOrder,
    itemId: string | null,
    discount: IDiscountBody
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
      if (isStale(cause)) {
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

    const discount = { kind: input.kind, value: input.value, note: input.note }
    const after = await quote(order, input.itemId, discount)

    if (after === null) {
      return
    }

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
      await save(order, input.itemId, discount)
    }
  }

  const remove = async (itemId: string | null): Promise<void> => {
    if (order === null || isSubmitting) {
      return
    }

    const after = await quote(order, itemId, null)

    if (after === null) {
      return
    }

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
      onDraftChange: setDraft,
      preview,
    },
  }
}
