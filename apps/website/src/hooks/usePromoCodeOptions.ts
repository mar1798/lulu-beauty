import useSWR from 'swr'
import type { IOrderPromoCode, IPromoCodeOption } from 'widgets/types'
import { describePromoCodeConditions, describePromoCodeRewards } from 'widgets/utils'
import { listMyPromoCodes } from '@/services/endpoints/promotions'
import { promoCodesKey } from '@/services/swrKeys'

/** Что даёт код и при каких условиях, одной строкой: «Скидка 10% · от 3 000 сом». */
export const promoCodeSummary = (code: Pick<IOrderPromoCode, 'rewards' | 'conditions'>): string =>
  [describePromoCodeRewards(code), describePromoCodeConditions(code)]
    .filter(part => part !== '')
    .join(' · ')

/**
 * «Ваши промокоды» под полем ввода - на оформлении и на странице поданной заявки.
 * `userId: null` - не запрашивать.
 */
export const usePromoCodeOptions = (userId: string | null): IPromoCodeOption[] => {
  const { data } = useSWR(userId === null ? null : promoCodesKey(userId), listMyPromoCodes)

  return (
    (data ?? [])
      // «Ещё не начал действовать» код всё равно ответит сам при проверке: сервер знает время.
      .filter(code => code.status === 'ACTIVE')
      .map(code => ({ code: code.code, label: promoCodeSummary(code) }))
  )
}
