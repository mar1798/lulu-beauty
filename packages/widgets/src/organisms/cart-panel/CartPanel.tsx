import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICartPanelProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Divider } from '../../atoms/divider'
import { Price } from '../../atoms/price'
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
export const CartPanel: FC<ICartPanelProps & IBasicStyling> = ({
  cart,
  buildProductHref,
  onQuantityChange,
  onRemove,
  onCheckout,
  isBusy = false,
  error,
  emptyState,
  className,
}) => {
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
