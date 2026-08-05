import clsx from 'clsx'
import { Fragment, type FC, useState } from 'react'
import type { IAdminOrdersTableProps, IBasicStyling } from '../../types'
import { IconTrash } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { IconButton } from '../../atoms/icon-button'
import { Price } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { StatusSelect } from '../../molecules/status-select'
import { formatDateTime } from '../../utils/datetime'
import { pluralize } from '../../utils/plural'
import * as styles from './AdminOrdersTable.css'

/**
 * Заявки покупателей с возможностью сменить статус.
 *
 * Состав заявки раскрывается по строке, а не открывается отдельной страницей:
 * владельцу нужно собрать заказ, то есть видеть позиции нескольких заявок
 * подряд, и переходы туда-обратно этому мешают.
 *
 * Телефон — ссылка `tel:`: с этого экрана владелец звонит покупателю, и
 * копировать номер руками незачем.
 */

const DEFAULT_SKELETON_ROWS = 5
const ORDER_NUMBER_LENGTH = 8

/** Заявка, покупатель, состав, сумма, статус — колонка действий необязательна. */
const BASE_COLUMNS = 5

const orderNumber = (id: string): string => id.slice(0, ORDER_NUMBER_LENGTH).toUpperCase()

export const AdminOrdersTable: FC<IAdminOrdersTableProps & IBasicStyling> = ({
  orders,
  onStatusChange,
  onDelete,
  buildProductHref,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  busyId = null,
  emptyState,
  className,
}) => {
  const [expanded, setExpanded] = useState<string[]>([])

  const toggle = (orderId: string): void => {
    setExpanded(current =>
      current.includes(orderId)
        ? current.filter(id => id !== orderId)
        : [...current, orderId]
    )
  }

  if (!isLoading && orders.length === 0) {
    return <>{emptyState}</>
  }

  /* Колонка действий необязательна, а `colSpan` у скелетонов и состава — нет. */
  const columnCount = onDelete === undefined ? BASE_COLUMNS : BASE_COLUMNS + 1

  return (
    <div className={clsx(styles.wrap, className)}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.headCell} scope="col">
              Заявка
            </th>
            <th className={styles.headCell} scope="col">
              Покупатель
            </th>
            <th className={styles.headCell} scope="col">
              Состав
            </th>
            <th className={styles.headCell} scope="col">
              Сумма
            </th>
            <th className={styles.headCell} scope="col">
              Статус
            </th>
            {onDelete !== undefined && (
              <th className={styles.headCell} scope="col">
                Действия
              </th>
            )}
          </tr>
        </thead>

        <tbody aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: skeletonRows }, (_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index}>
                  <td className={styles.cell} colSpan={columnCount}>
                    <Skeleton height={40} shape="block" />
                  </td>
                </tr>
              ))
            : orders.map(order => {
                const isExpanded = expanded.includes(order.id)

                return (
                  /* Fragment с ключом: строка заявки и строка состава — соседи в `tbody`. */
                  <Fragment key={order.id}>
                    <tr>
                      <td className={styles.cell}>
                        <div className={styles.order}>
                          <span className={styles.number}>№ {orderNumber(order.id)}</span>
                          <span className={styles.date}>{formatDateTime(order.createdAt)}</span>
                        </div>
                      </td>

                      <td className={styles.cell}>
                        <div className={styles.customer}>
                          <span className={styles.customerName}>{order.customerName}</span>
                          <AppLink
                            href={`tel:${order.customerPhone}`}
                            className={styles.phone}
                            legacy={true}
                          >
                            {order.customerPhone}
                          </AppLink>
                        </div>
                      </td>

                      <td className={styles.cell}>
                        <button
                          type="button"
                          className={styles.toggle}
                          aria-expanded={isExpanded}
                          onClick={() => {
                            toggle(order.id)
                          }}
                        >
                          {pluralize(order.items.length, ['позиция', 'позиции', 'позиций'])}
                        </button>
                      </td>

                      <td className={styles.cell}>
                        <Price priceCents={order.totalCents} size="sm" />
                      </td>

                      <td className={styles.cell}>
                        <StatusSelect
                          value={order.status}
                          isLabelHidden={true}
                          disabled={busyId === order.id}
                          onChange={status => {
                            onStatusChange(order, status)
                          }}
                        />
                      </td>

                      {onDelete !== undefined && (
                        <td className={styles.cell}>
                          <IconButton
                            icon={<IconTrash />}
                            label={`Удалить заявку № ${orderNumber(order.id)}`}
                            variant="danger"
                            size="sm"
                            disabled={busyId === order.id}
                            onClick={() => {
                              onDelete(order)
                            }}
                          />
                        </td>
                      )}
                    </tr>

                    {isExpanded && (
                      <tr className={styles.detailsRow}>
                        <td className={styles.detailsCell} colSpan={columnCount}>
                          <ul className={styles.items}>
                            {order.items.map(item => (
                              <li key={`${item.productSlug}-${item.productName}`} className={styles.item}>
                                <span className={styles.itemName}>
                                  {item.productId === null ? (
                                    item.productName
                                  ) : (
                                    <AppLink
                                      href={buildProductHref(item.productSlug)}
                                      className={styles.itemLink}
                                    >
                                      {item.productName}
                                    </AppLink>
                                  )}
                                </span>

                                <span className={styles.itemQuantity}>× {item.quantity}</span>
                                <Price priceCents={item.lineTotalCents} size="sm" />
                              </li>
                            ))}
                          </ul>

                          {order.note !== null && order.note !== '' && (
                            <p className={styles.note}>Комментарий: {order.note}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}
