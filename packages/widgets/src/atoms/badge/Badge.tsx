import clsx from 'clsx'
import { type FC } from 'react'
import type { IBadgeProps, IBasicStyling } from '../../types'
import * as styles from './Badge.css'

/**
 * Небольшая метка: статус заявки, статус цикла, «нет в наличии».
 *
 * `withDot` добавляет точку-индикатор — статус не должен опознаваться
 * только по цвету фона.
 */
export const Badge: FC<IBadgeProps & IBasicStyling> = ({
  children,
  tone = 'neutral',
  withDot = false,
  className,
}) => (
  <span className={clsx(styles.container, styles.tone[tone], className)}>
    {withDot && <span className={styles.dot} aria-hidden={true} />}
    {children}
  </span>
)
