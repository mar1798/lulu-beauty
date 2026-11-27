import type {
  IAdminPromoCode,
  IPage,
  IPromotionCodeReward,
  IPromotionCondition,
  IPromotionParticipant,
} from 'widgets/types'
import { api } from '../api'
import type { IDeletion } from './promotions'

/**
 * Промокоды владельца: админские ручки `/admin/promo-codes/*` (только владелец).
 *
 * Параметры запроса, как у акций, - camelCase (`includeDeleted`, `pageSize`).
 * Поиск покупателя для персонального кода - тот же `listAdminUsers`, что у окна
 * «Новая заявка»; картинка подарка - `uploadGiftImage` из `promotions.ts`.
 */

export interface IPromoCodeInput {
  /** `null` - сгенерировать (при правке - заменить новым). Иначе - код как набран. */
  code: string | null
  title: string
  /** HTML из редактора; `null` - описания нет. */
  descriptionHtml: string | null
  /** ISO-строки с таймзоной. Окно `[startsAt, endsAt)`; `endsAt: null` - бессрочный. */
  startsAt: string
  endsAt: string | null
  isEnabled: boolean
  /** Персональный код - id покупателей, которым он выдан; пустой список - общий. */
  assignedUserIds: string[]
  /** Сколько раз один покупатель может применить код, не чаще раза за сбор; `null` - без ограничений. */
  usesPerCustomer: number | null
  conditions: IPromotionCondition[]
  rewards: IPromotionCodeReward[]
}

/** Все промокоды, свежие и архивные - по `includeDeleted`. Статус и число использований считает бэкенд. */
export const listAdminPromoCodes = (includeDeleted = false): Promise<IAdminPromoCode[]> =>
  api.get('/admin/promo-codes', { query: { includeDeleted } })

export const getAdminPromoCode = (promoCodeId: string): Promise<IAdminPromoCode> =>
  api.get(`/admin/promo-codes/${encodeURIComponent(promoCodeId)}`)

export const createPromoCode = (input: IPromoCodeInput): Promise<IAdminPromoCode> =>
  api.post('/admin/promo-codes', { body: input })

/** PUT: промокод уходит целиком, оба списка заменяются. */
export const updatePromoCode = (
  promoCodeId: string,
  input: IPromoCodeInput
): Promise<IAdminPromoCode> =>
  api.put(`/admin/promo-codes/${encodeURIComponent(promoCodeId)}`, { body: input })

export const setPromoCodeEnabled = (
  promoCodeId: string,
  isEnabled: boolean
): Promise<IAdminPromoCode> =>
  api.patch(`/admin/promo-codes/${encodeURIComponent(promoCodeId)}/enabled`, {
    body: { isEnabled },
  })

/**
 * Удаляет промокод, а если его уже применяли (в том числе снятые участия) -
 * переводит в архив: строка кода при этом остаётся занятой. Какой из двух случаев
 * вышел, говорит `deleted` в ответе.
 */
export const deletePromoCode = (promoCodeId: string): Promise<IDeletion> =>
  api.remove(`/admin/promo-codes/${encodeURIComponent(promoCodeId)}`)

export const listPromoCodeParticipants = (
  promoCodeId: string,
  page: number,
  pageSize: number
): Promise<IPage<IPromotionParticipant>> =>
  api.get(`/admin/promo-codes/${encodeURIComponent(promoCodeId)}/participants`, {
    query: { page, pageSize },
  })
