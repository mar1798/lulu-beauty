import { type FC } from 'react'
import type { IBadgeProps, IBasicStyling, IOrderStatusBadgeProps, OrderStatus } from '../../types'
import { Badge } from '../../atoms/badge'

/**
 * Статус заявки словами.
 *
 * Единственное место, где `OrderStatus` превращается в русский текст, — иначе
 * подписи разъезжаются между списком заявок, карточкой и админкой. Переходы
 * между статусами фронт не ограничивает: state-machine на бэке нет
 * (пробел №8 в плане), владелец ставит любой статус.
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
  CANCELLED: { label: 'Отменена', tone: 'danger' },
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
