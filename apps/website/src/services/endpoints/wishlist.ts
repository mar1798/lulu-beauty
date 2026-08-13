import type { IWishlist } from 'widgets/types'
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
