import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICartPanelProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Divider } from '../../atoms/divider'
import { Price } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { CartItemRow } from '../../molecules/cart-item-row'
import { DeadlineCountdown } from '../../molecules/deadline-countdown'
import * as styles from './CartPanel.css'

/**
 * Корзина: позиции слева, итог и переход к оформлению справа.
 *
 * Дедлайн показывается прямо в итоге, а не где-то в шапке: после закрытия
 * сбора корзина остаётся, но оформить её уже нельзя — это и есть главное,
 * что человек должен видеть рядом с кнопкой.
 *
 * Пустая корзина и «сбора нет» — разные состояния и разные подсказки.
 */

const DEFAULT_SKELETON_ROWS = 2

export const CartPanel: FC<ICartPanelProps & IBasicStyling> = ({
  cart,
  buildProductHref,
  onQuantityChange,
  onRemove,
  onCheckout,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  isBusy = false,
  error,
  emptyState,
  className,
}) => {
  /*
    Скелетон повторяет раскладку корзины (позиции + итог сбоку), а не
    подменяет её спиннером: иначе после ответа страница перекладывается
    целиком, и человек теряет место, куда собирался нажать.
  */
  if (isLoading) {
    return (
      <div className={clsx(styles.container, className)} aria-busy={true}>
        <div className={styles.items}>
          {Array.from({ length: skeletonRows }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className={styles.skeletonRow}>
              {/* Ширина пропсом, а не классом: `Skeleton` ставит её инлайном. */}
              <Skeleton shape="block" width={64} className={styles.skeletonThumb} />

              <div className={styles.skeletonLines}>
                <Skeleton width="60%" />
                <Skeleton width="35%" height={14} />
              </div>
            </div>
          ))}
        </div>

        <div className={styles.summary}>
          <Skeleton width="50%" height={20} />
          <Skeleton width="100%" height={14} />
          <Divider />
          <Skeleton width="40%" height={24} />
          <Skeleton shape="block" width="100%" height={48} />
        </div>
      </div>
    )
  }

  if (cart === null || cart.items.length === 0) {
    return <>{emptyState}</>
  }

  const hasCycle = cart.cycleId !== null

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.items}>
        {cart.items.map(item => (
          <CartItemRow
            key={item.productId}
            item={item}
            href={buildProductHref(item.productSlug)}
            isBusy={isBusy}
            onQuantityChange={quantity => onQuantityChange(item.productId, quantity)}
            onRemove={() => onRemove(item.productId)}
          />
        ))}
      </div>

      <div className={styles.summary}>
        {error !== undefined && error !== null && (
          <Alert tone="danger" title="Не получилось">
            {error}
          </Alert>
        )}

        {hasCycle ? (
          <DeadlineCountdown deadlineAt={cart.cycleDeadlineAt} />
        ) : (
          <Alert tone="warning" title="Приём заявок закрыт">
            Сейчас нет открытого сбора. Корзина сохранится до следующего.
          </Alert>
        )}

        <Divider />

        <div className={styles.totalRow}>
          <Text weight="medium">Итого</Text>
          <Price priceCents={cart.totalCents} size="lg" />
        </div>

        <Button isFullWidth={true} disabled={!hasCycle || isBusy} onClick={onCheckout}>
          Оформить заявку
        </Button>

        <Text size="sm" tone="muted">
          Оплата не проводится: владелец свяжется с вами после закрытия сбора.
        </Text>
      </div>
    </div>
  )
}
