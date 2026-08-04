import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IOrderDetailsProps } from '../../types'
import { formatDateTime } from '../../utils/datetime'
import { pluralize } from '../../utils/plural'
import { Divider } from '../../atoms/divider'
import { Heading } from '../../atoms/heading'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { ITEM_FORMS, orderNumber } from '../../molecules/order-card'
import { OrderItemRow } from '../../molecules/order-item-row'
import { OrderStatusBadge } from '../../molecules/order-status-badge'
import * as styles from './OrderDetails.css'

/**
 * Поданная заявка.
 *
 * Состав неизменяем: менять заявку после отправки нельзя ни через какую ручку
 * бэкенда, поэтому здесь нет ни степперов, ни удаления — только то, что
 * увидит владелец. Позиции — снапшот цен на момент оформления.
 */
export const OrderDetails: FC<IOrderDetailsProps & IBasicStyling> = ({
  order,
  buildProductHref,
  isCurrentCycle = false,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    <div className={styles.head}>
      <div className={styles.headMain}>
        {/* h2: h1 страницы занят названием раздела в `AccountTemplate`. */}
        <Heading level={2} size="md">
          {`Заявка ${orderNumber(order.id)}`}
        </Heading>
        <Text size="sm" tone="muted">
          {`Оформлена ${formatDateTime(order.createdAt)}`}
        </Text>
      </div>

      <OrderStatusBadge status={order.status} />
    </div>

    {isCurrentCycle && (
      <Text size="sm" tone="secondary">
        Заявка относится к текущему сбору. Если нужно что-то изменить — напишите владельцу
        до его закрытия.
      </Text>
    )}

    {order.note !== null && order.note !== '' && (
      <div className={styles.note}>
        <Text size="sm" weight="medium">
          Ваш комментарий
        </Text>
        <Text size="sm" tone="secondary">
          {order.note}
        </Text>
      </div>
    )}

    <Divider />

    <div className={styles.items}>
      {order.items.map(item => (
        <OrderItemRow
          // Удалённый товар приходит с `productId: null` — ключом остаётся слаг.
          key={item.productId ?? item.productSlug}
          item={item}
          href={item.productId === null ? null : buildProductHref(item.productSlug)}
        />
      ))}
    </div>

    <div className={styles.totalRow}>
      <Text weight="medium">{`Итого · ${pluralize(order.items.length, ITEM_FORMS)}`}</Text>
      <Price priceCents={order.totalCents} size="lg" />
    </div>
  </div>
)
