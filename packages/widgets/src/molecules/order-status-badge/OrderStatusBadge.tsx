import { type FC } from 'react'
import type { IBadgeProps, IBasicStyling, IOrderStatusBadgeProps, OrderStatus } from '../../types'
import { Badge } from '../../atoms/badge'

/**
 * Статус заявки словами.
 *
 * Единственное место, где `OrderStatus` превращается в русский текст, — иначе
 * подписи разъезжаются между списком заявок, карточкой и админкой.
 *
 * Отмен две, и различаются они не оттенком, а тем, кто её сделал: покупатель
 * передумал или владелец не смог достать товар — для обеих сторон это разные
 * новости, и одна «Отменена» их путала. Что владелец вправе поставить и из какого
 * статуса, говорит `ORDER_STATUS_TRANSITIONS`; «Отменена покупателем» не встречается
 * там ни разу — это утверждение о чужом действии, и бэкенд его тоже не принимает
 * (`order_status_not_assignable`).
 */

interface IStatusView {
  label: string
  tone: IBadgeProps['tone']
}

const VIEWS: Record<OrderStatus, IStatusView> = {
  PENDING: { label: 'Ожидает подтверждения', tone: 'warning' },
  CONFIRMED: { label: 'Подтверждена', tone: 'info' },
  READY: { label: 'Готова к выдаче', tone: 'brand' },
  COMPLETED: { label: 'Выдана', tone: 'success' },
  CANCELLED_BY_CUSTOMER: { label: 'Отменена покупателем', tone: 'danger' },
  CANCELLED_BY_OWNER: { label: 'Отменена владельцем', tone: 'danger' },
}

/** Все статусы в порядке жизненного цикла — для фильтров и сводок. */
export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OWNER',
]

/**
 * Куда заявка может уйти из каждого статуса — зеркало `ALLOWED_TRANSITIONS`
 * в `apps/api/app/orders/models.py`.
 *
 * Правило теперь есть на бэкенде (он отвечает `order_status_transition_invalid`),
 * поэтому список выбора обязан его повторять: раньше в поле стояли все статусы
 * подряд, и промах мышью на строку «Подтверждена» у отменённой заявки отправлял
 * покупателю уведомление о заявке, которую тот отозвал.
 *
 * Отмена доступна из любого живого статуса — «не смогла достать» случается
 * вплоть до выдачи. Из терминальных не ведёт ничего: вернуть заявку может
 * только сам покупатель, и она возвращается в «Ожидает».
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED_BY_OWNER'],
  CONFIRMED: ['READY', 'CANCELLED_BY_OWNER'],
  READY: ['COMPLETED', 'CANCELLED_BY_OWNER'],
  COMPLETED: [],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_OWNER: [],
}

export const orderStatusLabel = (status: OrderStatus): string => VIEWS[status].label

export const OrderStatusBadge: FC<IOrderStatusBadgeProps & IBasicStyling> = ({
  status,
  className,
}) => (
  <Badge tone={VIEWS[status].tone} withDot={true} className={className}>
    {VIEWS[status].label}
  </Badge>
)
