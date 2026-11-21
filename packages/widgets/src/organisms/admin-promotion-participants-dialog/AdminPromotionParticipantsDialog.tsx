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
import { Pagination } from '../../molecules/pagination'
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
 * Участников у акции не ограничено, поэтому список постраничный: страницу
 * отдаёт сервер (`page`/`pageSize`/`total` — из `IPage`), окно только просит
 * следующую. Настоящая `<table>`, ниже `md` раскладывающаяся в карточки, как
 * остальные таблицы админки: подписи колонок берутся из `data-label`.
 */

const SKELETON_ROWS = 5
const COLUMN_COUNT = 5

export const AdminPromotionParticipantsDialog: FC<
  IAdminPromotionParticipantsDialogProps & IBasicStyling
> = ({
  isOpen,
  onClose,
  promotionTitle,
  participants,
  page,
  pageSize,
  total,
  onPageChange,
  error = null,
  buildOrderHref,
  className,
}) => {
  const isLoading = participants === null

  return (
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
      ) : !isLoading && participants.length === 0 ? (
        <Text tone="muted">Пока никто не участвовал: заявок с этой акцией нет.</Text>
      ) : (
        <div className={styles.content}>
          <div className={styles.wrap}>
            <table className={styles.table} role="table">
              <thead className={styles.head} role="rowgroup">
                <tr className={styles.row} role="row">
                  <th className={styles.headCell} scope="col" role="columnheader">
                    Покупатель
                  </th>
                  <th className={styles.headCell} scope="col" role="columnheader">
                    Заявка
                  </th>
                  <th className={styles.headAmountCell} scope="col" role="columnheader">
                    Сумма
                  </th>
                  <th className={styles.headCell} scope="col" role="columnheader">
                    Получил
                  </th>
                  <th className={styles.headCell} scope="col" role="columnheader">
                    Когда
                  </th>
                </tr>
              </thead>

              <tbody className={styles.body} role="rowgroup" aria-busy={isLoading}>
                {isLoading
                  ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <tr key={index} className={styles.row} role="row">
                        <td className={styles.cell} role="cell" colSpan={COLUMN_COUNT}>
                          <Skeleton height={40} shape="block" />
                        </td>
                      </tr>
                    ))
                  : participants.map(participant => {
                      const isReleased = participant.releasedAt !== null

                      return (
                        <tr
                          key={participant.orderPromotionId}
                          className={clsx(styles.row, isReleased && styles.rowReleased)}
                          role="row"
                        >
                          <td className={styles.cell} role="cell">
                            <span className={styles.customer}>
                              <span className={styles.name}>{participant.userName}</span>
                              {isReleased && <Badge tone="neutral">Снято</Badge>}
                            </span>
                          </td>

                          <td className={styles.cell} role="cell" data-label="Заявка">
                            <span className={styles.order}>
                              <AppLink
                                href={buildOrderHref(participant.orderId)}
                                className={styles.orderLink}
                              >
                                № {adminOrderNumber(participant.orderId)}
                              </AppLink>
                              <OrderStatusBadge status={participant.orderStatus} />
                            </span>
                          </td>

                          <td className={styles.amountCell} role="cell" data-label="Сумма">
                            <Price priceCents={participant.orderTotalCents} size="sm" />
                          </td>

                          <td className={styles.cell} role="cell" data-label="Получил">
                            <span className={styles.rewards}>
                              {describeRewardsLine(participant.rewards)}
                            </span>
                          </td>

                          <td className={styles.cell} role="cell" data-label="Когда">
                            <span className={styles.date}>
                              {isReleased
                                ? `Снято ${formatDateTime(participant.releasedAt ?? '')}`
                                : formatDateTime(participant.createdAt)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>

          {total > pageSize && (
            <Pagination page={page} pageSize={pageSize} total={total} onChange={onPageChange} />
          )}
        </div>
      )}
    </Modal>
  )
}
