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
 * новости, и одна «Отменена» их путала. Ставить «Отменена покупателем» владелец
 * не может (бэкенд отвечает `order_status_not_assignable`), поэтому список для
 * выбора — `ASSIGNABLE_ORDER_STATUSES`, а не `ORDER_STATUSES`.
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

/** Те же, кроме отмены покупателем: это утверждение о его действии, а не о своём. */
export const ASSIGNABLE_ORDER_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(
  status => status !== 'CANCELLED_BY_CUSTOMER'
)

export const orderStatusLabel = (status: OrderStatus): string => VIEWS[status].label

export const OrderStatusBadge: FC<IOrderStatusBadgeProps & IBasicStyling> = ({
  status,
  className,
}) => (
  <Badge tone={VIEWS[status].tone} withDot={true} className={className}>
    {VIEWS[status].label}
  </Badge>
)
