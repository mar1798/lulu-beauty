import type {
  IPage,
  IProduct,
  IPromoCode,
  IPromotion,
  IPromotionCondition,
  IPromotionParticipant,
  IPromotionReward,
  IPublicPromotion,
  PromotionBannerVariant,
} from 'widgets/types'
import { api } from '../api'

/**
 * Акции: админские ручки `/admin/promotions/*` (только владелец).
 *
 * Параметры запроса, как у `/admin/products`, — camelCase (`includeDeleted`).
 * Баннер и картинка подарка — multipart: поле `file`, у баннера ещё `?variant=`.
 */

export interface IPromotionInput {
  slug: string
  title: string
  /** HTML из редактора; `null` — описания нет. */
  descriptionHtml: string | null
  /** ISO-строки с таймзоной. Окно `[startsAt, endsAt)`; `endsAt: null` — бессрочная. */
  startsAt: string
  endsAt: string | null
  isEnabled: boolean
  announce: boolean
  sortOrder: number
  conditions: IPromotionCondition[]
  rewards: IPromotionReward[]
}

/** Все акции, свежие и архивные — по `includeDeleted`. Статус и число участников считает бэкенд. */
export const listAdminPromotions = (includeDeleted = false): Promise<IPromotion[]> =>
  api.get('/admin/promotions', { query: { includeDeleted } })

export const getAdminPromotion = (promotionId: string): Promise<IPromotion> =>
  api.get(`/admin/promotions/${encodeURIComponent(promotionId)}`)

export const createPromotion = (input: IPromotionInput): Promise<IPromotion> =>
  api.post('/admin/promotions', { body: input })

/** PUT: акция уходит целиком, оба списка заменяются. Баннеры тут не меняются. */
export const updatePromotion = (promotionId: string, input: IPromotionInput): Promise<IPromotion> =>
  api.put(`/admin/promotions/${encodeURIComponent(promotionId)}`, { body: input })

export const setPromotionEnabled = (promotionId: string, isEnabled: boolean): Promise<IPromotion> =>
  api.patch(`/admin/promotions/${encodeURIComponent(promotionId)}/enabled`, {
    body: { isEnabled },
  })

/**
 * Удаляет акцию, а если в ней уже участвовали (в том числе снятые участия и
 * выданные коды) — переводит в архив. Какой из двух случаев вышел, из ответа не
 * видно (204): страница решает по `participantsCount` заранее.
 */
export const deletePromotion = (promotionId: string): Promise<void> =>
  api.remove(`/admin/promotions/${encodeURIComponent(promotionId)}`)

/** Ставит баннер; заменённый файл бэкенд удаляет из хранилища сам. */
export const uploadPromotionBanner = (
  promotionId: string,
  variant: PromotionBannerVariant,
  file: File
): Promise<IPromotion> => {
  const body = new FormData()

  body.append('file', file)

  return api.post(`/admin/promotions/${encodeURIComponent(promotionId)}/banner`, {
    body,
    query: { variant },
  })
}

export const removePromotionBanner = (
  promotionId: string,
  variant: PromotionBannerVariant
): Promise<IPromotion> =>
  api.remove(`/admin/promotions/${encodeURIComponent(promotionId)}/banner`, {
    query: { variant },
  })

export const listPromotionParticipants = (promotionId: string): Promise<IPromotionParticipant[]> =>
  api.get(`/admin/promotions/${encodeURIComponent(promotionId)}/participants`)

/**
 * Картинка свободного подарка. Акция может быть ещё не сохранена, поэтому
 * загрузка ничего не привязывает: ответ — адрес из нашего хранилища, он уходит в
 * награду при сохранении акции.
 */
export const uploadGiftImage = async (file: File): Promise<string> => {
  const body = new FormData()

  body.append('file', file)

  const result = await api.post<{ url: string }>('/admin/promotions/gift-image', { body })

  return result.url
}

/** Размер выдачи поиска товара в конструкторе: ровно столько умещается в блок без прокрутки. */
export const PROMOTION_PRODUCT_SEARCH_LIMIT = 8

/**
 * Поиск товаров для целей скидок и подарка. Тот же `GET /admin/products`, что и
 * у списка товаров: живые товары по слову из названия.
 */
export const searchProductsForPromotion = async (query: string): Promise<IProduct[]> => {
  const page = await api.get<IPage<IProduct>>('/admin/products', {
    query: { q: query, pageSize: PROMOTION_PRODUCT_SEARCH_LIMIT },
  })

  return page.items
}

/* --- Витрина: публичные акции и коды покупателя --- */

/**
 * Идущие сейчас акции - для карусели, страниц акций и карты сайта. Публичная
 * ручка: работает и на сервере (`getStaticProps`), и из браузера. Баннеров у
 * акции может не быть - карусель такие отбрасывает сама.
 */
export const listPublicPromotions = (): Promise<IPublicPromotion[]> => api.get('/promotions')

/** Одна идущая акция; не начавшаяся, завершённая, выключенная и архивная - 404. */
export const getPublicPromotion = (slug: string): Promise<IPublicPromotion> =>
  api.get(`/promotions/${encodeURIComponent(slug)}`)

/** Все промокоды покупателя, в том числе использованные и отозванные. */
export const listMyPromoCodes = (): Promise<IPromoCode[]> => api.get('/me/promo-codes')
