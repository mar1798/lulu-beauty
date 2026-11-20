import { describe, expect, it } from 'vitest'
import type { IPromotion } from 'widgets/types'
import { referencedProductIds } from '@/hooks/usePromotionCatalog'
import { deleteConfirmation, duplicateOf, toPromotionInput } from './promotions'

const promotion = (overrides: Partial<IPromotion> = {}): IPromotion => ({
  id: 'p-1',
  slug: 'spring',
  title: 'Весна',
  descriptionHtml: '<p>Текст</p>',
  bannerMobileUrl: 'http://files/m.webp',
  bannerDesktopUrl: null,
  startsAt: '2026-03-01T00:00:00Z',
  endsAt: '2026-03-31T00:00:00Z',
  isEnabled: true,
  announce: true,
  announcedAt: null,
  sortOrder: 3,
  conditions: [{ type: 'SUBTOTAL', minCents: 100_000, target: null }],
  rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null }],
  status: 'ACTIVE',
  participantsCount: 0,
  deletedAt: null,
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  ...overrides,
})

describe('«Дублировать»', () => {
  it('копирует условия и награды, но не даты, включённость и анонс', () => {
    const copy = duplicateOf(promotion())

    expect(copy.title).toBe('Весна (копия)')
    expect(copy.slug).toBe('spring-copy')
    expect(copy.startsAt).toBe('')
    expect(copy.endsAt).toBe('')
    expect(copy.isEnabled).toBe(false)
    expect(copy.announce).toBe(false)
    expect(copy.conditions).toEqual(promotion().conditions)
    expect(copy.rewards).toEqual(promotion().rewards)
  })
})

describe('тело запроса', () => {
  it('пустое описание уходит как null, баннеры в запрос не попадают', () => {
    const input = toPromotionInput({
      ...duplicateOf(promotion()),
      descriptionHtml: '',
      startsAt: '2026-03-01T00:00:00Z',
      endsAt: '2026-03-31T00:00:00Z',
      banners: { mobile: null, desktop: null },
    })

    expect(input.descriptionHtml).toBeNull()
    expect(input).not.toHaveProperty('banners')
  })
})

describe('подтверждение удаления', () => {
  it('у акции с участниками говорит про архив', () => {
    const text = deleteConfirmation(promotion({ participantsCount: 4 }))

    expect(text.title).toBe('Убрать акцию в архив?')
    expect(text.confirmLabel).toBe('В архив')
  })

  it('у акции без участников — про удаление, но с оговоркой про архив', () => {
    const text = deleteConfirmation(promotion())

    expect(text.confirmLabel).toBe('Удалить')
    expect(text.description).toMatch(/архив/)
  })
})

describe('товары, на которые ссылается акция', () => {
  it('собирает id из условий, скидок и вложенного промокода без повторов', () => {
    const target = (
      id: string
    ): { productIds: string[]; categoryIds: string[]; brands: string[] } => ({
      productIds: [id],
      categoryIds: [],
      brands: [],
    })

    expect(
      referencedProductIds(
        [{ type: 'CONTAINS', mode: 'ANY', target: target('b') }],
        [
          { type: 'DISCOUNT', kind: 'PERCENT', value: 5, target: target('a') },
          {
            type: 'PROMO_CODE',
            validDays: 7,
            validFrom: null,
            validUntil: null,
            conditions: [{ type: 'QUANTITY', minQuantity: 2, target: target('a') }],
            rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 5, target: target('c') }],
          },
        ]
      )
    ).toEqual(['a', 'b', 'c'])
  })
})
