import type { IOrder, IPage } from 'widgets/types'
import { api } from '../api'

/** Заказы покупателя. Оформление переносит текущую корзину в заказ активного сбора. */

export const checkout = (note?: string): Promise<IOrder> =>
  api.post('/orders/checkout', { body: { note: note ?? null } })

export interface IMyOrderListParams {
  page?: number
  pageSize?: number
}

/**
 * Размер страницы своих заявок. Один на всех, кто их запрашивает: ключ SWR
 * (`ordersKey`) знает только номер страницы, и два разных размера легли бы в
 * один кеш — на `/orders` появлялся бы список чужой длины.
 */
export const MY_ORDERS_PAGE_SIZE = 10

/**
 * Постранично: у покупателя, заказывающего каждый сбор, история накапливается
 * без предела, а каждая заявка едет со всеми своими позициями.
 *
 * Параметры — `page`/`page_size` в snake_case: так их принимают покупательские
 * ручки (как `GET /products`), camelCase — только у `/admin/*`.
 */
export const listMyOrders = (params: IMyOrderListParams = {}): Promise<IPage<IOrder>> =>
  api.get('/orders', { query: { page: params.page, page_size: params.pageSize } })

export const getMyOrder = (orderId: string): Promise<IOrder> =>
  api.get(`/orders/${encodeURIComponent(orderId)}`)

/**
 * Правка поданной заявки. Доступна, пока сбор открыт и заявка в статусе
 * «Ожидает подтверждения», — считает это бэкенд и отдаёт в `isEditable`;
 * при отказе приходит 409 `order_not_editable`. Отмена этим окном не
 * ограничена — у неё свой флаг, см. `cancelMyOrder`.
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
  api.patch(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`, {
    body: { quantity },
  })

export const removeMyOrderItem = (orderId: string, itemId: string): Promise<IOrder> =>
  api.remove(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`)

export const updateMyOrderNote = (orderId: string, note: string | null): Promise<IOrder> =>
  api.patch(`/orders/${encodeURIComponent(orderId)}`, { body: { note } })

/**
 * Отмена — покупательский аналог удаления: заявка остаётся видна владельцу.
 *
 * Переживает закрытие сбора, в отличие от правки (`isCancellable` против
 * `isEditable`): против неподтверждённой заявки ничего не куплено, и отзыв
 * список закупки укорачивает, а не переписывает. Кончается на `UNFULFILLED` —
 * закупка мимо такой заявки уже прошла, отвечает по ней магазин. При отказе —
 * тот же 409 `order_not_editable`: владелец заявку взял или ждать её уже
 * поздно.
 */
export const cancelMyOrder = (orderId: string): Promise<IOrder> =>
  api.post(`/orders/${encodeURIComponent(orderId)}/cancel`)

/**
 * Возврат своей отмены — ровно в том же окне, в каком отмена и доступна: заявка
 * возвращается в «Ожидает подтверждения» тем же составом и с теми же ценами,
 * отмена их не трогала. Более узкое окно просто перенесло бы тупик на шаг
 * дальше: отменить из закрытого сбора можно, а передумать — уже нет. Отмену
 * владельца эта ручка не снимает: «не смогла достать» — его решение, и
 * отзывает он его сам, из админки.
 *
 * Право на возврат считает бэкенд и отдаёт в `isRestorable`; при отказе
 * приходит 409 `order_not_restorable` — заявку отменил владелец, сбор закрылся
 * так давно, что в закупку её заведомо не взяли, или возвращать нечего.
 */
export const restoreMyOrder = (orderId: string): Promise<IOrder> =>
  api.post(`/orders/${encodeURIComponent(orderId)}/restore`)
