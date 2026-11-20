import { describe, expect, it } from 'vitest'
import type { IPromotionReward } from '../types'
import {
  buildConditions,
  buildPromoCode,
  buildRewards,
  conditionToDraft,
  describeRewards,
  newConditionDraft,
  newPromoCodeDraft,
  newRewardDraft,
  rewardToDraft,
} from './promotion'

describe('описание наград', () => {
  it('называет скидку, подарок и промокод словами', () => {
    const rewards: IPromotionReward[] = [
      { type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null },
      {
        type: 'DISCOUNT',
        kind: 'AMOUNT',
        value: 50_000,
        target: { productIds: ['a'], categoryIds: [], brands: [] },
      },
      {
        type: 'GIFT',
        gift: 'CUSTOM',
        title: 'Mystery box',
        imageUrl: null,
        variantId: null,
        quantity: 2,
      },
      {
        type: 'PROMO_CODE',
        validDays: 30,
        validFrom: null,
        validUntil: null,
        conditions: [],
        rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 5, target: null }],
      },
    ]

    expect(describeRewards(rewards)).toEqual([
      'Скидка 10%',
      expect.stringContaining('на выбранные товары'),
      'Подарок: Mystery box × 2',
      expect.stringContaining('Промокод на 30 дней'),
    ])
  })
})

describe('условия: черновик → тело запроса', () => {
  it('переводит сомы в тыйыны', () => {
    const draft = { ...newConditionDraft('SUBTOTAL'), amount: '2 000,50' }

    expect(buildConditions([draft]).value).toEqual([
      { type: 'SUBTOTAL', minCents: 200_050, target: null },
    ])
  })

  it('отмечает ошибку у строки, а не роняет весь список', () => {
    const bad = newConditionDraft('QUANTITY')
    const good = { ...newConditionDraft('QUANTITY'), quantity: '3' }
    const built = buildConditions([bad, good])

    expect(built.value).toHaveLength(1)
    expect(Object.keys(built.errors)).toEqual([bad.key])
  })

  it('«содержит» без цели не принимается', () => {
    const draft = newConditionDraft('CONTAINS')

    expect(buildConditions([draft]).errors[draft.key]).toMatch(/товар/)
  })

  it('возвращается в тот же черновик и обратно', () => {
    const condition = {
      type: 'CONTAINS' as const,
      mode: 'ALL' as const,
      target: { productIds: ['p'], categoryIds: [], brands: ['Anua'] },
    }

    expect(buildConditions([conditionToDraft(condition)]).value).toEqual([condition])
  })
})

describe('награды: черновик → тело запроса', () => {
  it('процент — целое от 1 до 100', () => {
    const over = { ...newRewardDraft('DISCOUNT'), value: '101' }
    const ok = { ...newRewardDraft('DISCOUNT'), value: '100' }

    expect(buildRewards([over]).errors[over.key]).toBeDefined()
    expect(buildRewards([ok]).value).toEqual([
      { type: 'DISCOUNT', kind: 'PERCENT', value: 100, target: null },
    ])
  })

  it('пустое название свободного подарка становится «Mystery box»', () => {
    const draft = { ...newRewardDraft('GIFT'), giftTitle: '  ' }

    expect(buildRewards([draft]).value[0]).toMatchObject({ gift: 'CUSTOM', title: 'Mystery box' })
  })

  it('подарок-товар без выбранного варианта — ошибка', () => {
    const draft = { ...newRewardDraft('GIFT'), gift: 'PRODUCT' as const, giftVariantId: null }

    expect(buildRewards([draft]).errors[draft.key]).toBeDefined()
  })

  it('сумма скидки с целью без выбора — ошибка, а не скидка на корзину', () => {
    const draft = {
      ...newRewardDraft('DISCOUNT'),
      kind: 'AMOUNT' as const,
      value: '100',
      hasTarget: true,
    }

    expect(buildRewards([draft]).errors[draft.key]).toMatch(/Выберите/)
  })

  it('наградa снова становится черновиком без потерь', () => {
    const reward: IPromotionReward = {
      type: 'GIFT',
      gift: 'PRODUCT',
      title: 'Тонер, 50 мл',
      imageUrl: null,
      variantId: 'v-1',
      quantity: 2,
    }

    expect(buildRewards([rewardToDraft(reward)]).value).toEqual([reward])
  })
})

describe('промокод', () => {
  const withReward = (): ReturnType<typeof newPromoCodeDraft> => ({
    ...newPromoCodeDraft(),
    rewards: [{ ...newRewardDraft('DISCOUNT'), value: '10' }],
  })

  it('без наград не сохраняется', () => {
    expect(buildPromoCode(newPromoCodeDraft()).error).toMatch(/Добавьте/)
  })

  it('срок в днях — до 365', () => {
    expect(buildPromoCode({ ...withReward(), validDays: '366' }).error).toMatch(/Срок/)
    expect(buildPromoCode({ ...withReward(), validDays: '30' }).value).toMatchObject({
      type: 'PROMO_CODE',
      validDays: 30,
      validFrom: null,
    })
  })

  it('даты: обе нужны, и конец позже начала', () => {
    const base = { ...withReward(), validity: 'DATES' as const }

    expect(buildPromoCode(base).error).toMatch(/обе даты/)
    expect(
      buildPromoCode({ ...base, validFromDate: '2026-05-10', validUntilDate: '2026-05-01' }).error
    ).toMatch(/позже/)

    const built = buildPromoCode({
      ...base,
      validFromDate: '2026-05-01',
      validUntilDate: '2026-05-31',
    })

    expect(built.value?.validDays).toBeNull()
    expect(built.value?.validFrom).not.toBeNull()
  })

  it('внутри промокода промокода быть не может', () => {
    const draft = { ...newPromoCodeDraft(), rewards: [newRewardDraft('PROMO_CODE')] }

    expect(buildPromoCode(draft).value).toBeNull()
  })
})
