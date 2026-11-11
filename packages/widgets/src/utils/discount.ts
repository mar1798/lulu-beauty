import type { DiscountKind, IAdminOrderEditLine, IOrder } from '../types'
import { formatPrice } from '../atoms/price/Price'

/**
 * Скидки админа — только то, как их назвать.
 *
 * Во что скидка обходится в деньгах, считает один бэкенд
 * (`apps/api/app/orders/discounts.py`): суммы приходят в ответе API уже со
 * скидками, а окно скидки спрашивает будущую сумму у
 * `POST /admin/orders/{id}/discount/preview`. Второй копии арифметики здесь
 * нет и быть не должно — она обязана совпадать до тыйына, а две копии рано или
 * поздно разойдутся.
 */

export const MAX_DISCOUNT_PERCENT = 100

/** `MAX_DISCOUNT_NOTE_LENGTH` бэкенда. */
export const DISCOUNT_NOTE_MAX_LENGTH = 500

/** «10%» или «500 сом» — скидка так, как её задали, а не во что она обошлась. */
export const formatDiscount = (kind: DiscountKind, value: number): string =>
  kind === 'PERCENT' ? `${value}%` : formatPrice(value)

/** Строки, которых правка состава касается: убранные и с другим количеством. */
export const editedItemIds = (
  order: Pick<IOrder, 'items'>,
  lines: readonly Pick<IAdminOrderEditLine, 'itemId' | 'quantity'>[]
): string[] =>
  order.items
    .filter(item => lines.find(line => line.itemId === item.id)?.quantity !== item.quantity)
    .map(item => item.id)

/**
 * Скидки, которые снимет правка состава, — названиями: «скидка 10% на всю
 * заявку», «скидка 500 сом на «Крем»». Правило одно для покупателя и для
 * админа (`_customer_changed` и `edit_by_admin` в API): скидка на заявку
 * снимается при любой правке, скидка строки — когда правка касается этой
 * строки (`itemIds`). Пусто — снимать нечего.
 */
export const lostDiscounts = (
  order: Pick<IOrder, 'discountKind' | 'discountValue' | 'items'>,
  itemIds: readonly string[]
): string[] => {
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

  return lost
}
