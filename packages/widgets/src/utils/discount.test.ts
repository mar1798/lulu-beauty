import { describe, expect, it } from 'vitest'
import { feedOrder, feedOrderItem } from '../stories/feed'
import { formatPrice } from '../atoms/price/Price'
import {
  discountCents,
  discountProblem,
  editedItemIds,
  formatDiscount,
  lostDiscounts,
  totalWithDiscount,
} from './discount'

/** Те же случаи, что `tests/test_order_discounts.py` бэкенда: правила обязаны совпадать. */
describe('discount', () => {
  it('процент округляется до целых сомов, половина — в пользу покупателя', () => {
    expect(discountCents('PERCENT', 10, 125_500)).toBe(12_600)
    expect(discountCents('PERCENT', 10, 125_400)).toBe(12_500)
  })

  it('сумма не больше того, из чего вычитается', () => {
    expect(discountCents('AMOUNT', 50_000, 30_000)).toBe(30_000)
  })

  it('скидка заявки — с того, что осталось после скидок строк', () => {
    const order = feedOrder({
      items: [
        feedOrderItem({
          id: 'a',
          lineTotalCents: 20_000,
          discountKind: 'AMOUNT',
          discountValue: 5_000,
          discountCents: 5_000,
        }),
        feedOrderItem({ id: 'b', lineTotalCents: 5_000 }),
      ],
    })

    expect(totalWithDiscount(order, { itemId: null, kind: 'PERCENT', value: 10 })).toBe(18_000)
    // Снятие скидки со строки возвращает ей полную цену.
    expect(totalWithDiscount(order, { itemId: 'a', kind: null, value: null })).toBe(25_000)
  })

  it('пишет скидку так, как её задали', () => {
    expect(formatDiscount('PERCENT', 15)).toBe('15%')
    expect(formatDiscount('AMOUNT', 150_000)).toBe(formatPrice(150_000))
  })

  it('находит скидку, округлившуюся до нуля', () => {
    const order = feedOrder({ items: [feedOrderItem({ id: 'a', lineTotalCents: 4_000 })] })

    // 1% от 40 сом — 0,4 сома, до целых — ноль.
    expect(discountProblem(order, { itemId: 'a', kind: 'PERCENT', value: 1 })).toBe('zero')
    expect(discountProblem(order, { itemId: 'a', kind: 'PERCENT', value: 5 })).toBeNull()
  })

  it('скидка строки не должна оставить скидке заявки меньше её суммы', () => {
    const order = feedOrder({
      items: [
        feedOrderItem({ id: 'a', lineTotalCents: 3_000 }),
        feedOrderItem({ id: 'b', lineTotalCents: 2_000 }),
      ],
      discountKind: 'AMOUNT',
      discountValue: 4_000,
      discountCents: 4_000,
    })

    expect(discountProblem(order, { itemId: 'b', kind: 'AMOUNT', value: 2_000 })).toBe('exceeds')
    expect(discountProblem(order, { itemId: 'b', kind: 'AMOUNT', value: 1_000 })).toBeNull()
  })
})

describe('lostDiscounts', () => {
  const order = {
    discountKind: 'PERCENT' as const,
    discountValue: 10,
    items: [
      { id: 'a', productName: 'Крем', discountKind: 'AMOUNT' as const, discountValue: 50_000 },
      { id: 'b', productName: 'Тонер', discountKind: null, discountValue: null },
    ],
  }

  it('скидка на заявку снимается всегда, скидка строки — если правка её касается', () => {
    expect(lostDiscounts(order as never, [])).toEqual(['скидка 10% на всю заявку'])
    expect(lostDiscounts(order as never, ['a', 'b'])).toEqual([
      'скидка 10% на всю заявку',
      `скидка ${formatDiscount('AMOUNT', 50_000)} на «Крем»`,
    ])
  })
})

describe('editedItemIds', () => {
  it('убранные строки и строки с другим количеством', () => {
    const order = {
      items: [
        { id: 'a', quantity: 1 },
        { id: 'b', quantity: 2 },
        { id: 'c', quantity: 3 },
      ],
    }
    const lines = [
      { itemId: 'a', quantity: 1 },
      { itemId: 'b', quantity: 5 },
      { itemId: null, quantity: 1 },
    ]

    expect(editedItemIds(order as never, lines)).toEqual(['b', 'c'])
  })
})
