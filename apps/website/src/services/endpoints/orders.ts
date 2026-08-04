import type { IOrder } from 'widgets/types'
import { api } from '../api'

/** Заказы покупателя. Оформление переносит текущую корзину в заказ активного сбора. */

export const checkout = (note?: string): Promise<IOrder> =>
  api.post('/orders/checkout', { body: { note: note ?? null } })

/** Без пагинации: бэк отдаёт плоский список (`response_model=list[OrderResponse]`). */
export const listMyOrders = (): Promise<IOrder[]> => api.get('/orders')

export const getMyOrder = (orderId: string): Promise<IOrder> =>
  api.get(`/orders/${encodeURIComponent(orderId)}`)
