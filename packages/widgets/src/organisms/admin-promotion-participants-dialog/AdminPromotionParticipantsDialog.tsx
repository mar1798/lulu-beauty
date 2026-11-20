import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminPromotionParticipantsDialogProps, IBasicStyling } from '../../types'
import { Alert } from '../../atoms/alert'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { Price } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { OrderStatusBadge } from '../../molecules/order-status-badge'
import { formatDateTime } from '../../utils/datetime'
import { describeRewardsLine } from '../../utils/promotion'
import { adminOrderNumber } from '../admin-orders-table'
import { Modal } from '../modal'
import * as styles from './AdminPromotionParticipantsDialog.css'

/**
 * Кто участвовал в акции: покупатель, заявка (ссылкой), её статус и сумма, что
 * он получил по акции и когда.
 *
 * Участие через заявку: отменённая заявка или условия, которые перестали
 * выполняться, снимают участие — такая строка остаётся в списке с пометкой
 * «Снято», потому что именно её владелец и ищет, когда покупатель спрашивает,
 * куда делась скидка. Награды берутся из снимка на момент участия: правка акции
 * позже их не меняет.
 *
 * Список — карточки, а не таблица: окно узкое, а строка из пяти разнородных
 * значений на телефоне и так бы развернулась в карточку.
 */

const SKELETON_ROWS = 3

export const AdminPromotionParticipantsDialog: FC<
  IAdminPromotionParticipantsDialogProps & IBasicStyling
> = ({
  isOpen,
  onClose,
  promotionTitle,
  participants,
  error = null,
  buildOrderHref,
  className,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={`Участники: ${promotionTitle}`}
    size="lg"
    className={className}
    footer={
      <div className={styles.footer}>
        <Button variant="secondary" isFullWidth="mobile" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    }
  >
    {error !== null ? (
      <Alert tone="danger" title="Не удалось загрузить участников">
        {error}
      </Alert>
    ) : participants === null ? (
      <div className={styles.list} aria-busy={true}>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={index} height={88} shape="block" />
        ))}
      </div>
    ) : participants.length === 0 ? (
      <Text tone="muted">Пока никто не участвовал: заявок с этой акцией нет.</Text>
    ) : (
      <ul className={styles.list}>
        {participants.map(participant => {
          const isReleased = participant.releasedAt !== null

          return (
            <li
              key={participant.orderPromotionId}
              className={clsx(styles.item, isReleased && styles.itemReleased)}
            >
              <div className={styles.top}>
                <span className={styles.name}>{participant.userName}</span>
                {isReleased && <Badge tone="neutral">Снято</Badge>}
              </div>

              <div className={styles.order}>
                <AppLink href={buildOrderHref(participant.orderId)} className={styles.orderLink}>
                  № {adminOrderNumber(participant.orderId)}
                </AppLink>
                <OrderStatusBadge status={participant.orderStatus} />
                <Price priceCents={participant.orderTotalCents} size="sm" />
              </div>

              <span className={styles.rewards}>{describeRewardsLine(participant.rewards)}</span>

              <span className={styles.date}>
                {isReleased
                  ? `Снято ${formatDateTime(participant.releasedAt ?? '')}`
                  : formatDateTime(participant.createdAt)}
              </span>
            </li>
          )
        })}
      </ul>
    )}
  </Modal>
)
