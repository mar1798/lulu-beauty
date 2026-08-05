import type { IOrder } from 'widgets/types'
import { api } from '../api'

/** Заказы покупателя. Оформление переносит текущую корзину в заказ активного сбора. */

export const checkout = (note?: string): Promise<IOrder> =>
  api.post('/orders/checkout', { body: { note: note ?? null } })

/** Без пагинации: бэк отдаёт плоский список (`response_model=list[OrderResponse]`). */
export const listMyOrders = (): Promise<IOrder[]> => api.get('/orders')

export const getMyOrder = (orderId: string): Promise<IOrder> =>
  api.get(`/orders/${encodeURIComponent(orderId)}`)

/**
 * Правка поданной заявки. Доступна, пока сбор открыт и заявка в статусе
 * «Ожидает подтверждения», — считает это бэкенд и отдаёт в `isEditable`;
 * при отказе приходит 409 `order_not_editable`.
 *
 * Каждая ручка возвращает заявку целиком: сумму и признак `isEditable`
 * пересчитывает сервер, и полагаться на локальный пересчёт нельзя.
 */

/**
 * Добавление товара в уже поданную заявку. Корзина тут не при чём: она
 * копится под **следующую** заявку, и положенное в неё эту не изменит.
 *
 * Снапшот снимается в момент добавления — новая позиция встаёт по текущей
 * цене каталога, а уже лежащие в заявке сохраняют свою. Товар, который в
 * заявке уже есть, сливается со своей строкой, а не заводит вторую.
 */
export const addMyOrderItem = (
  orderId: string,
  productId: string,
  quantity: number = 1
): Promise<IOrder> =>
  api.post(`/orders/${encodeURIComponent(orderId)}/items`, { body: { productId, quantity } })

export const updateMyOrderItemQuantity = (
  orderId: string,
  itemId: string,
  quantity: number
): Promise<IOrder> =>
  api.patch(
    `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    { body: { quantity } }
  )

export const removeMyOrderItem = (orderId: string, itemId: string): Promise<IOrder> =>
  api.remove(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`)

export const updateMyOrderNote = (orderId: string, note: string | null): Promise<IOrder> =>
  api.patch(`/orders/${encodeURIComponent(orderId)}`, { body: { note } })

/** Отмена — покупательский аналог удаления: заявка остаётся видна владельцу. */
export const cancelMyOrder = (orderId: string): Promise<IOrder> =>
  api.post(`/orders/${encodeURIComponent(orderId)}/cancel`)

/**
 * Возврат отменённой заявки. Отмена обратима, пока сбор открыт: заявка
 * возвращается в «Ожидает подтверждения» тем же составом и с теми же ценами —
 * отмена их не трогала.
 *
 * Право на возврат считает бэкенд и отдаёт в `isRestorable`; при отказе
 * приходит 409 `order_not_restorable` — либо дедлайн уже прошёл, либо
 * возвращать нечего.
 */
export const restoreMyOrder = (orderId: string): Promise<IOrder> =>
  api.post(`/orders/${encodeURIComponent(orderId)}/restore`)
