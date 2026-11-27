import { describe, expect, it } from 'vitest'
import type { IAdminPromoCode, IAdminPromoCodeValues } from 'widgets/types'
import { deleteConfirmation, duplicateOf, toPromoCodeInput } from './promoCodes'

const values = (overrides: Partial<IAdminPromoCodeValues> = {}): IAdminPromoCodeValues => ({
  code: null,
  title: 'Скидка',
  descriptionHtml: '',
  startsAt: '2026-12-01T00:00:00+06:00',
  endsAt: null,
  isEnabled: true,
  assignedUsers: [],
  usesPerCustomer: 1,
  conditions: [],
  rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null }],
  ...overrides,
})

const promoCode = (overrides: Partial<IAdminPromoCode> = {}): IAdminPromoCode => ({
  id: 'code-1',
  code: 'LETO2026',
  title: 'Лето',
  descriptionHtml: '<p>Для своих</p>',
  startsAt: '2026-12-01T00:00:00+06:00',
  endsAt: '2026-12-31T23:59:00+06:00',
  isEnabled: true,
  assignedUsers: [
    { id: 'u-1', name: 'Айгуль', phone: '+996700123456', telegramLinked: true, isDeleted: false },
  ],
  usesPerCustomer: 2,
  conditions: [],
  rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null }],
  status: 'ACTIVE',
  participantsCount: 0,
  deletedAt: null,
  createdAt: '2026-11-01T00:00:00+06:00',
  updatedAt: '2026-11-01T00:00:00+06:00',
  ...overrides,
})

describe('toPromoCodeInput', () => {
  it('автокод уходит как code: null', () => {
    expect(toPromoCodeInput(values()).code).toBeNull()
  })

  it('свой код уходит как есть', () => {
    expect(toPromoCodeInput(values({ code: 'LETO2026' })).code).toBe('LETO2026')
  })

  it('общий код - пустой список, персональный - id покупателей', () => {
    expect(toPromoCodeInput(values()).assignedUserIds).toEqual([])

    const assignedUsers = [
      { id: 'u-1', name: 'Айгуль', phone: '+996', telegramLinked: true },
      { id: 'u-2', name: 'Бермет', phone: '+996', telegramLinked: true },
    ]

    expect(toPromoCodeInput(values({ assignedUsers })).assignedUserIds).toEqual(['u-1', 'u-2'])
  })

  it('число применений уходит как есть, «без ограничений» - null', () => {
    expect(toPromoCodeInput(values({ usesPerCustomer: 3 })).usesPerCustomer).toBe(3)
    expect(toPromoCodeInput(values({ usesPerCustomer: null })).usesPerCustomer).toBeNull()
  })

  it('пустое описание - null', () => {
    expect(toPromoCodeInput(values()).descriptionHtml).toBeNull()
    expect(toPromoCodeInput(values({ descriptionHtml: '<p>a</p>' })).descriptionHtml).toBe(
      '<p>a</p>'
    )
  })
})

describe('duplicateOf', () => {
  it('код генерируется заново, покупатель и даты сброшены, копия выключена', () => {
    const copy = duplicateOf(promoCode())

    expect(copy.code).toBeNull()
    expect(copy.title).toBe('Лето (копия)')
    expect(copy.assignedUsers).toEqual([])
    expect(copy.usesPerCustomer).toBe(2)
    expect(copy.startsAt).toBe('')
    expect(copy.endsAt).toBe('')
    expect(copy.isEnabled).toBe(false)
  })

  it('бессрочный остаётся бессрочным', () => {
    expect(duplicateOf(promoCode({ endsAt: null })).endsAt).toBeNull()
  })
})

describe('deleteConfirmation', () => {
  it('применённый код уходит в архив, и в тексте сказано, что строка занята', () => {
    const confirmation = deleteConfirmation(promoCode({ participantsCount: 3 }))

    expect(confirmation.confirmLabel).toBe('В архив')
    expect(confirmation.description).toMatch(/останется занятой/)
  })

  it('неприменённый - «Удалить»', () => {
    expect(deleteConfirmation(promoCode()).confirmLabel).toBe('Удалить')
  })
})
