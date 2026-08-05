import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IOrderListProps } from '../../types'
import { Appear } from '../../atoms/appear'
import { Skeleton } from '../../atoms/skeleton'
import { OrderCard } from '../../molecules/order-card'
import * as styles from './OrderList.css'

/**
 * Список заявок покупателя: загрузка, пусто, карточки.
 *
 * Порядок задаёт бэкенд (свежие сверху) — фронт не пересортировывает,
 * иначе список разъедется с тем, что видит владелец.
 */

const DEFAULT_SKELETON_COUNT = 3

export const OrderList: FC<IOrderListProps & IBasicStyling> = ({
  orders,
  buildHref,
  isLoading = false,
  skeletonCount = DEFAULT_SKELETON_COUNT,
  emptyState,
  className,
}) => {
  if (isLoading) {
    return (
      <div className={clsx(styles.container, className)} aria-busy={true}>
        {Array.from({ length: skeletonCount }, (_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className={styles.skeletonCard}>
            <Skeleton width="45%" />
            <Skeleton width="30%" height={14} />
            <Skeleton width="60%" height={20} />
          </div>
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return <>{emptyState}</>
  }

  /* Появление проигрывается на смену состава — не на каждую перерисовку. */
  return (
    <Appear appearKey={orders.map(order => order.id).join()}>
      <ul className={clsx(styles.container, className)}>
        {orders.map(order => (
          <li key={order.id}>
            <OrderCard order={order} href={buildHref(order)} className={styles.card} />
          </li>
        ))}
      </ul>
    </Appear>
  )
}
