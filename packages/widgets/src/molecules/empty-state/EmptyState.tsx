import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IEmptyStateProps } from '../../types'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './EmptyState.css'

/**
 * Пустое состояние: ничего не нашлось, корзина пуста, заявок ещё нет.
 *
 * Заголовок по умолчанию второго уровня: пустое состояние встаёт прямо под
 * `h1` страницы, и третий уровень давал бы пропуск h1 → h3 (axe: `heading-order`).
 * Там, где блок вложен глубже, уровень задаётся явно через `level`.
 */
export const EmptyState: FC<IEmptyStateProps & IBasicStyling> = ({
  title,
  description,
  icon,
  action,
  level = 2,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    {icon !== undefined && (
      <span className={styles.icon} aria-hidden={true}>
        {icon}
      </span>
    )}

    <Heading level={level} size="sm">
      {title}
    </Heading>

    {description !== undefined && <Text tone="secondary">{description}</Text>}

    {action !== undefined && <div className={styles.action}>{action}</div>}
  </div>
)
