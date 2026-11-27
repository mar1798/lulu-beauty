import type { IAdminBannerItem, IBannerSlideDto, PromotionBannerVariant } from 'widgets/types'
import { api } from '../api'

/**
 * Баннеры карусели каталога: публичная лента и админский раздел «Баннеры».
 *
 * Лента `GET /banners` публичная: работает и на сервере (`getStaticProps`), и из
 * браузера. Админские ручки - только владелец. Картинка новости - multipart: поле
 * `file`, `?variant=mobile|desktop`, как у баннера акции.
 */

export interface INewsBannerInput {
  title: string
  text: string | null
  linkUrl: string | null
  ctaLabel: string | null
  /** ISO с таймзоной; `null` - показывать сразу. */
  startsAt: string | null
  /** `null` - без даты окончания. */
  endsAt: string | null
  isEnabled: boolean
}

/** Слайды карусели в порядке показа: идущие акции с баннером и живые новости. */
export const listBannerFeed = (): Promise<IBannerSlideDto[]> => api.get('/banners')

/** Все неархивные автоакции и все новости в порядке ленты, с состоянием каждой. */
export const listAdminBanners = (): Promise<IAdminBannerItem[]> => api.get('/admin/banners')

/** «Показывать в карусели» у акции. Сама акция и её скидка не меняются. */
export const setPromotionShown = (
  promotionId: string,
  isShown: boolean
): Promise<IAdminBannerItem> =>
  api.patch(`/admin/banners/promotions/${encodeURIComponent(promotionId)}`, {
    body: { isShown },
  })

/** Полный порядок ключей; при расхождении с текущим списком бэкенд отвечает 409. */
export const reorderBanners = (keys: string[]): Promise<IAdminBannerItem[]> =>
  api.put('/admin/banners/order', { body: { keys } })

export const getAdminNewsBanner = (newsId: string): Promise<IAdminBannerItem> =>
  api.get(`/admin/banners/news/${encodeURIComponent(newsId)}`)

export const createNewsBanner = (input: INewsBannerInput): Promise<IAdminBannerItem> =>
  api.post('/admin/banners/news', { body: input })

/** PUT: новость уходит целиком. Картинки тут не меняются. */
export const updateNewsBanner = (
  newsId: string,
  input: INewsBannerInput
): Promise<IAdminBannerItem> =>
  api.put(`/admin/banners/news/${encodeURIComponent(newsId)}`, { body: input })

export const setNewsBannerEnabled = (
  newsId: string,
  isEnabled: boolean
): Promise<IAdminBannerItem> =>
  api.patch(`/admin/banners/news/${encodeURIComponent(newsId)}/enabled`, {
    body: { isEnabled },
  })

/** Удаляет новость вместе с картинками: файлы бэкенд убирает после сохранения. */
export const deleteNewsBanner = (newsId: string): Promise<void> =>
  api.remove(`/admin/banners/news/${encodeURIComponent(newsId)}`)

/** Ставит картинку; заменённый файл бэкенд удаляет из хранилища сам. */
export const uploadNewsBannerImage = (
  newsId: string,
  variant: PromotionBannerVariant,
  file: File
): Promise<IAdminBannerItem> => {
  const body = new FormData()

  body.append('file', file)

  return api.post(`/admin/banners/news/${encodeURIComponent(newsId)}/image`, {
    body,
    query: { variant },
  })
}

export const removeNewsBannerImage = (
  newsId: string,
  variant: PromotionBannerVariant
): Promise<IAdminBannerItem> =>
  api.remove(`/admin/banners/news/${encodeURIComponent(newsId)}/image`, { query: { variant } })
