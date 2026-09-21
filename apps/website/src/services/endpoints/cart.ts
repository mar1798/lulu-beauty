import type { ICart } from 'widgets/types'
import { api } from '../api'

/**
 * Корзина. Каждая ручка возвращает корзину целиком — состояние на клиенте
 * не пересчитывается, а просто заменяется ответом.
 *
 * Позиция корзины адресуется **variantId** — объёмом товара, а не товаром
 * (`@router.patch("/items/{variant_id}")` в `app/cart/router.py`). Своего
 * идентификатора у строки нет: объём и есть то, что покупают, и двух объёмов
 * одного товара в корзине может лежать две строки.
 */

export const getCart = (): Promise<ICart> => api.get('/cart')

export const addCartItem = (variantId: string, quantity = 1): Promise<ICart> =>
  api.post('/cart/items', { body: { variantId, quantity } })

export const updateCartItem = (variantId: string, quantity: number): Promise<ICart> =>
  api.patch(`/cart/items/${encodeURIComponent(variantId)}`, { body: { quantity } })

export const removeCartItem = (variantId: string): Promise<ICart> =>
  api.remove(`/cart/items/${encodeURIComponent(variantId)}`)

export const emptyCart = (): Promise<ICart> => api.remove('/cart')
