import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IEmptyStateProps } from '../../types'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './EmptyState.css'

/**
 * Пустое состояние: ничего не нашлось, корзина пуста, заявок ещё нет.
 *
 * Заголовок — не `Heading` уровня 1: пустое состояние живёт внутри секции,
 * у которой уже есть свой заголовок, поэтому по умолчанию берётся третий
 * уровень и иерархия документа не рвётся.
 */
export const EmptyState: FC<IEmptyStateProps & IBasicStyling> = ({
  title,
  description,
  icon,
  action,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    {icon !== undefined && (
      <span className={styles.icon} aria-hidden={true}>
        {icon}
      </span>
    )}

    <Heading level={3} size="sm">
      {title}
    </Heading>

    {description !== undefined && <Text tone="secondary">{description}</Text>}

    {action !== undefined && <div className={styles.action}>{action}</div>}
  </div>
)
