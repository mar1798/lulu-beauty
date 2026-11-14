import type { IProduct, IWishlist } from 'widgets/types'
import { api } from '../api'

/**
 * Избранное. Как и корзина, каждая ручка отвечает списком целиком — клиент
 * ничего не досчитывает, а заменяет состояние ответом.
 *
 * От сбора не зависит: добавлять можно всегда, в том числе когда «в корзину»
 * недоступна, — в этом и смысл раздела.
 *
 * Позиция адресуется **productId** (`/wishlist/items/{product_id}`).
 */

export const getWishlist = (): Promise<IWishlist> => api.get('/wishlist')

export const addWishlistItem = (productId: string): Promise<IWishlist> =>
  api.post('/wishlist/items', { body: { productId } })

export const removeWishlistItem = (productId: string): Promise<IWishlist> =>
  api.remove(`/wishlist/items/${encodeURIComponent(productId)}`)

/** Избранное гостя: только товары, без дат — когда что сохранено, знает браузер. */
export interface IGuestWishlistPreview {
  products: IProduct[]
}

/** Товары гостевого избранного, в присланном порядке. Публичная, ничего не хранит. */
export const previewWishlist = (productIds: string[]): Promise<IGuestWishlistPreview> =>
  api.post('/wishlist/preview', { body: { productIds } })

/** Перенос гостевого избранного в аккаунт после входа. Уже сохранённое не трогается. */
export const mergeWishlist = (productIds: string[]): Promise<IWishlist> =>
  api.post('/wishlist/merge', { body: { productIds } })
