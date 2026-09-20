import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IOrderCardProps } from '../../types'
import { formatDateTime } from '../../utils/datetime'
import { pluralize, type IPluralForms } from '../../utils/plural'
import { AppLink } from '../../atoms/app-link'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { OrderStatusBadge, pendingStageHint } from '../order-status-badge'
import * as styles from './OrderCard.css'

/**
 * Заявка в списке.
 *
 * Ссылкой оформлена вся карточка, но доступное имя собирается из номера и
 * даты: «заявка 3f2a1b9c от 4 августа» читается с закрытыми глазами лучше,
 * чем набор цифр и статус вперемешку.
 *
 * У ждущей заявки под датой стоит приписка о стадии (`pendingStage`). Именно в
 * списке разница и била по глазам: две заявки с одинаковым «Ожидает
 * подтверждения» вели себя по-разному, потому что за одинаковым словом стояли
 * идущий сбор и сбор, закрывшийся месяц назад.
 */

/** Полный UUID покупателю не нужен — по короткому номеру владелец находит заявку. */
const NUMBER_LENGTH = 8

export const ITEM_FORMS: IPluralForms = ['позиция', 'позиции', 'позиций']

export const orderNumber = (orderId: string): string => orderId.slice(0, NUMBER_LENGTH)

export const OrderCard: FC<IOrderCardProps & IBasicStyling> = ({ order, href, className }) => {
  const number = orderNumber(order.id)
  const created = formatDateTime(order.createdAt)

  return (
    <AppLink
      href={href}
      className={clsx(styles.container, className)}
      aria-label={`Заявка ${number} от ${created}`}
    >
      <div className={styles.head}>
        <Text weight="semibold">{`Заявка ${number}`}</Text>
        <OrderStatusBadge status={order.status} />
      </div>

      <Text size="sm" tone="muted">
        {created}
      </Text>

      {order.status === 'PENDING' && order.pendingStage !== null && (
        <Text size="sm" tone="secondary">
          {pendingStageHint(order.pendingStage)}
        </Text>
      )}

      <div className={styles.foot}>
        <Text size="sm" tone="secondary">
          {pluralize(order.items.length, ITEM_FORMS)}
        </Text>
        <Price priceCents={order.totalCents} />
      </div>
    </AppLink>
  )
}
