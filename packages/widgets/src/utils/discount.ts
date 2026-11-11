import type { DiscountKind, IAdminOrderEditLine, IDiscountFields, IOrder } from '../types'
import { formatPrice } from '../atoms/price/Price'

/**
 * Скидки админа в деньгах — зеркало `apps/api/app/orders/discounts.py`.
 *
 * Сумму заявки считает бэкенд, и в ответе она уже со скидками. Здесь — только
 * предпросмотр в окне скидки: «станет N» до того, как админ подтвердит, —
 * поэтому правила обязаны совпадать с бэкендом до тыйына. Порядок тот же:
 * скидка строки — с её цены × количества, скидка заявки — с того, что
 * осталось после скидок строк; процент округляется до целых сомов (половина —
 * в пользу покупателя), и ни одна скидка не больше того, из чего вычитается.
 */

const CENTS_IN_UNIT = 100

export const MAX_DISCOUNT_PERCENT = 100

/** `MAX_DISCOUNT_NOTE_LENGTH` бэкенда. */
export const DISCOUNT_NOTE_MAX_LENGTH = 500

export const discountCents = (
  kind: DiscountKind | null,
  value: number | null,
  baseCents: number
): number => {
  if (kind === null || value === null || baseCents <= 0) {
    return 0
  }

  const cents =
    kind === 'PERCENT'
      ? Math.floor((baseCents * value + CENTS_IN_UNIT * 50) / (CENTS_IN_UNIT * 100)) * CENTS_IN_UNIT
      : value

  return Math.max(0, Math.min(cents, baseCents))
}

/** «10%» или «500 сом» — скидка так, как её задали, а не во что она обошлась. */
export const formatDiscount = (kind: DiscountKind, value: number): string =>
  kind === 'PERCENT' ? `${value}%` : formatPrice(value)

/** Скидка, как её задаёт окно: на строку (`itemId`) или на всю заявку (`null`). */
export interface IDiscountTarget {
  itemId: string | null
  kind: DiscountKind | null
  value: number | null
}

/** Строка в расчёте: цена × количество и скидка, как её задали. */
export interface IDiscountLine {
  id: string | null
  lineTotalCents: number
  discountKind: DiscountKind | null
  discountValue: number | null
}

/** Скидка заявки, как её задали. */
export type IOrderDiscount = Pick<IDiscountFields, 'discountKind' | 'discountValue'>

export interface IDiscountPreview {
  /** Скидка каждой строки, в том же порядке. */
  lineDiscounts: number[]
  /** Из чего вычитается скидка заявки — что осталось после скидок строк. */
  afterLinesCents: number
  orderDiscountCents: number
  totalCents: number
}

/**
 * Суммы заявки сразу после действия админа — скидки или правки состава.
 *
 * Любое такое действие бэкенд заново привязывает все скидки к текущим суммам
 * (`anchor_discounts`), поэтому здесь каждая скидка считается от состава как
 * он есть: процент — от нынешней цены строки, скидка заявки — от того, что
 * осталось после скидок строк. Правки покупателя и каталога скидку только
 * уменьшают — это видно уже в ответе API, а не здесь.
 */
export const previewDiscounts = (
  lines: IDiscountLine[],
  order: IOrderDiscount
): IDiscountPreview => {
  const lineDiscounts = lines.map(line =>
    discountCents(line.discountKind, line.discountValue, line.lineTotalCents)
  )
  const afterLinesCents = lines.reduce(
    (sum, line, index) => sum + line.lineTotalCents - (lineDiscounts[index] ?? 0),
    0
  )
  const orderDiscountCents = discountCents(order.discountKind, order.discountValue, afterLinesCents)

  return {
    lineDiscounts,
    afterLinesCents,
    orderDiscountCents,
    totalCents: afterLinesCents - orderDiscountCents,
  }
}

/** Заявка с поставленной (или снятой — `kind: null`) скидкой у цели — для `previewDiscounts`. */
const withTarget = (
  order: IOrder,
  target: IDiscountTarget
): { lines: IDiscountLine[]; own: IOrderDiscount } => ({
  lines: order.items.map(item =>
    item.id === target.itemId
      ? { ...item, discountKind: target.kind, discountValue: target.value }
      : item
  ),
  own: target.itemId === null ? { discountKind: target.kind, discountValue: target.value } : order,
})

/** Сумма заявки, если у цели поставить такую скидку (или снять). */
export const totalWithDiscount = (order: IOrder, target: IDiscountTarget): number => {
  const { lines, own } = withTarget(order, target)

  return previewDiscounts(lines, own).totalCents
}

/**
 * Почему бэкенд откажет в такой скидке — зеркало `OrdersService._check_discounts`:
 * `zero` — округлилась до нуля, `exceeds` — сумма больше того, из чего вычитается
 * (и у цели, и у уже стоящей скидки заявки, которой новая скидка строки
 * оставит меньше). `null` — всё в порядке.
 */
export const discountProblem = (
  order: IOrder,
  target: IDiscountTarget
): 'zero' | 'exceeds' | null => {
  const { lines, own } = withTarget(order, target)
  const preview = previewDiscounts(lines, own)

  if (target.kind !== null) {
    const index = order.items.findIndex(item => item.id === target.itemId)
    const taken =
      target.itemId === null ? preview.orderDiscountCents : (preview.lineDiscounts[index] ?? 0)

    if (taken === 0) {
      return 'zero'
    }
  }

  const tooMuch = (kind: DiscountKind | null, value: number | null, taken: number): boolean =>
    kind === 'AMOUNT' && value !== null && taken < value

  if (
    lines.some((line, index) =>
      tooMuch(line.discountKind, line.discountValue, preview.lineDiscounts[index] ?? 0)
    )
  ) {
    return 'exceeds'
  }

  return tooMuch(own.discountKind, own.discountValue, preview.orderDiscountCents) ? 'exceeds' : null
}

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
