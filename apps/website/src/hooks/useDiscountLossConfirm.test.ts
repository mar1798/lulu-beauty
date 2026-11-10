import { describe, expect, it, vi } from 'vitest'
import type { IOrder, IOrderItem } from 'widgets/types'
import { discountLoss, linesOfVariants } from './useDiscountLossConfirm'

/*
  Контексты и `formatDiscount` тянут за собой компоненты widgets, а их этот
  конфиг не собирает (см. `vitest.config.ts`). Проверяется здесь только текст.
*/
vi.mock('widgets/contexts', () => ({ useConfirm: vi.fn() }))
vi.mock('widgets/utils', () => ({
  formatDiscount: (kind: string, value: number): string =>
    kind === 'PERCENT' ? `${value}%` : `${value / 100} сом`,
}))

const NO_DISCOUNT = {
  discountKind: null,
  discountValue: null,
  discountNote: null,
  discountCents: 0,
} as const

const line = (id: string, name: string, overrides: Partial<IOrderItem> = {}): IOrderItem => ({
  id,
  productId: `product-${id}`,
  variantId: `variant-${id}`,
  productName: name,
  productSlug: name.toLowerCase(),
  productImageUrl: null,
  productPriceCents: 100_000,
  quantity: 1,
  lineTotalCents: 100_000,
  productBrand: null,
  productCategoryName: null,
  productVolumeMl: null,
  ...NO_DISCOUNT,
  ...overrides,
})

const order = (overrides: Partial<IOrder> = {}): IOrder => ({
  id: 'order',
  cycleId: 'cycle',
  status: 'PENDING',
  totalCents: 200_000,
  subtotalCents: 200_000,
  ...NO_DISCOUNT,
  note: null,
  createdAt: '2026-11-01T00:00:00Z',
  items: [
    line('a', 'Balm'),
    line('b', 'Serum', { discountKind: 'AMOUNT', discountValue: 50_000, discountCents: 50_000 }),
  ],
  isEditable: true,
  isRestorable: false,
  isCancellable: true,
  pendingStage: 'COLLECTING',
  paidAt: null,
  ...overrides,
})

describe('discountLoss', () => {
  it('молчит, когда правка не трогает ни одной скидки', () => {
    expect(discountLoss(order(), ['a'])).toBeNull()
    expect(discountLoss(order(), [])).toBeNull()
  })

  it('предупреждает о скидке на всю заявку при любой правке', () => {
    const discounted = order({ discountKind: 'PERCENT', discountValue: 10 })

    expect(discountLoss(discounted, [])).toBe(
      'Скидка 10% на всю заявку будет снята - магазин давал её на прежний состав заявки'
    )
  })

  it('предупреждает о скидке строки, только если меняется эта строка', () => {
    expect(discountLoss(order(), ['b'])).toMatch(/^Скидка 500 сом на «Serum» будет снята/)
  })

  it('перечисляет обе скидки, когда снимаются обе', () => {
    const discounted = order({ discountKind: 'PERCENT', discountValue: 10 })

    expect(discountLoss(discounted, ['b'])).toMatch(
      /^Скидка 10% на всю заявку и скидка 500 сом на «Serum» будут сняты - магазин давал их/
    )
  })
})

describe('linesOfVariants', () => {
  it('находит строки, к которым прибавятся объёмы', () => {
    expect(linesOfVariants(order(), ['variant-b', 'variant-new'])).toEqual(['b'])
  })
})
