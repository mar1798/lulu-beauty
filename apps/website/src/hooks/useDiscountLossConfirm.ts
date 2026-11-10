import { useCallback } from 'react'
import { useConfirm } from 'widgets/contexts'
import type { IOrder } from 'widgets/types'
import { formatDiscount } from 'widgets/utils'

/**
 * Что из скидок снимет правка покупателя — зеркало `_customer_changed` в API.
 *
 * Скидку магазин давал на заявку в том составе, какой видел. Любая правка
 * покупателя снимает скидку на всю заявку, а правка строки — ещё и скидку
 * этой строки (строки, которых правка не касается, свою сохраняют).
 *
 * `itemIds` — строки, которые правка меняет; пусто, если затронута только
 * заявка целиком (новый объём, которого в ней ещё нет). Возвращает текст
 * предупреждения или `null`, если снимать нечего.
 */
export const discountLoss = (order: IOrder, itemIds: readonly string[]): string | null => {
  const lost: string[] = []

  if (order.discountKind !== null && order.discountValue !== null) {
    lost.push(`скидка ${formatDiscount(order.discountKind, order.discountValue)} на всю заявку`)
  }

  for (const item of order.items) {
    if (itemIds.includes(item.id) && item.discountKind !== null && item.discountValue !== null) {
      lost.push(
        `скидка ${formatDiscount(item.discountKind, item.discountValue)} на «${item.productName}»`
      )
    }
  }

  if (lost.length === 0) {
    return null
  }

  const subject =
    lost.length > 1 ? `${lost.slice(0, -1).join(', ')} и ${lost[lost.length - 1]}` : lost[0]
  const isMany = lost.length > 1

  return (
    `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ` +
    `${isMany ? 'будут сняты' : 'будет снята'} - магазин давал ${isMany ? 'их' : 'её'} ` +
    'на прежний состав заявки'
  )
}

/** Строки, к которым прибавятся эти объёмы: тот же объём сливается со своей строкой. */
export const linesOfVariants = (order: IOrder, variantIds: readonly string[]): string[] =>
  order.items
    .filter(item => item.variantId !== null && variantIds.includes(item.variantId))
    .map(item => item.id)

/**
 * Подтверждение правки, которая снимет скидку. Если снимать нечего, спрашивать
 * не о чем — сразу `true`.
 */
export const useDiscountLossConfirm = (): ((
  order: IOrder,
  itemIds: readonly string[]
) => Promise<boolean>) => {
  const { confirm } = useConfirm()

  return useCallback(
    async (order: IOrder, itemIds: readonly string[]): Promise<boolean> => {
      const loss = discountLoss(order, itemIds)

      if (loss === null) {
        return true
      }

      return confirm({
        title: 'Изменить заявку?',
        description: loss,
        confirmLabel: 'Изменить',
        cancelLabel: 'Не менять',
        tone: 'danger',
      })
    },
    [confirm]
  )
}
