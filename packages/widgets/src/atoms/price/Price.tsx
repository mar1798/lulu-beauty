import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IPriceProps } from '../../types'
import * as styles from './Price.css'

/**
 * Цена. Бэкенд хранит и отдаёт копейки (`priceCents`), а показывать нужно
 * `1 250 сом` — с русской группировкой разрядов.
 *
 * `Intl.NumberFormat` со `style: 'currency'` здесь не годится: для KGS он
 * даёт «1 250,00 KGS», а магазин говорит «сом». Поэтому число форматируется
 * как обычное, а единица подписывается отдельно.
 */

const CENTS_IN_UNIT = 100
const FRACTION_DIGITS = 2

export const DEFAULT_CURRENCY = 'сом'

export const formatPrice = (priceCents: number, currency: string = DEFAULT_CURRENCY): string => {
  const units = priceCents / CENTS_IN_UNIT
  const hasFraction = priceCents % CENTS_IN_UNIT !== 0

  const amount = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: hasFraction ? FRACTION_DIGITS : 0,
    maximumFractionDigits: FRACTION_DIGITS,
  }).format(units)

  return `${amount} ${currency}`
}

export const Price: FC<IPriceProps & IBasicStyling> = ({
  priceCents,
  currency = DEFAULT_CURRENCY,
  size = 'md',
  isFrom = false,
  className,
}) => (
  <span className={clsx(styles.container, styles.size[size], className)}>
    {/*
      «от» отдельным элементом, а не частью строки цены: оно относится к
      товару, а не к числу, и `formatPrice` используется ещё и там, где
      цена одна, — в корзине и в заявке.
    */}
    {isFrom && <span className={styles.from}>от </span>}
    {formatPrice(priceCents, currency)}
  </span>
)
