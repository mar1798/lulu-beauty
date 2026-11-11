import { describe, expect, it } from 'vitest'
import { editedItemIds, formatDiscount, lostDiscounts } from './discount'

describe('formatDiscount', () => {
  it('называет скидку так, как её задали', () => {
    expect(formatDiscount('PERCENT', 15)).toBe('15%')
    expect(formatDiscount('AMOUNT', 50_000)).toMatch(/^500\sсом$/)
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
