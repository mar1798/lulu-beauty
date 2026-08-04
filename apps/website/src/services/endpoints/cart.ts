import type { ICart } from 'widgets/types'
import { api } from '../api'

/**
 * Корзина. Каждая ручка возвращает корзину целиком — состояние на клиенте
 * не пересчитывается, а просто заменяется ответом.
 *
 * Позиция корзины адресуется **productId**, своего идентификатора у неё нет
 * (`@router.patch("/items/{product_id}")` в `app/cart/router.py`).
 */

export const getCart = (): Promise<ICart> => api.get('/cart')

export const addCartItem = (productId: string, quantity = 1): Promise<ICart> =>
  api.post('/cart/items', { body: { productId, quantity } })

export const updateCartItem = (productId: string, quantity: number): Promise<ICart> =>
  api.patch(`/cart/items/${encodeURIComponent(productId)}`, { body: { quantity } })

export const removeCartItem = (productId: string): Promise<ICart> =>
  api.remove(`/cart/items/${encodeURIComponent(productId)}`)

export const emptyCart = (): Promise<ICart> => api.remove('/cart')
