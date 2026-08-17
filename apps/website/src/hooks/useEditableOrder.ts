import useSWR from 'swr'
import type { IOrder, IPage } from 'widgets/types'
import { useAuth } from '@/contexts/AuthContext'
import { listMyOrders, MY_ORDERS_PAGE_SIZE } from '@/services/endpoints/orders'
import { ordersKey } from '@/services/swrKeys'

/**
 * Заявка покупателя, которую он ещё может дополнить, — если такая есть.
 *
 * Нужна корзине и оформлению: собирая вторую корзину при открытой заявке,
 * человек заводит на тот же сбор ещё одну — а владельцу приходят две заявки
 * от одного покупателя, которые он потом сводит руками. Дешевле показать, что
 * товар можно добавить в уже поданную.
 *
 * `isEditable` считает бэкенд (статус `PENDING` **и** сбор ещё открыт), и
 * фильтровать по одному лишь статусу здесь нельзя: заявка закрывшегося сбора
 * тоже `PENDING`, но добавить в неё уже нечего.
 *
 * Первая страница, ключ и размер — те же, что у `/orders`: список там и
 * проверка здесь делят один кеш, а `isOrdersKey` сбрасывает оба разом после
 * оформления или правки. Дальше первой страницы искать незачем — правится
 * только заявка текущего сбора, а она в списке новее всех.
 */
const FIRST_PAGE = 1

export const useEditableOrder = (): IOrder | null => {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const { data } = useSWR<IPage<IOrder>>(
    userId === null ? null : ordersKey(userId, FIRST_PAGE),
    () => listMyOrders({ page: FIRST_PAGE, pageSize: MY_ORDERS_PAGE_SIZE })
  )

  return data?.items.find(order => order.isEditable) ?? null
}
