import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IIconButtonProps } from '../../types'
import { VisuallyHidden } from '../visually-hidden'
import * as styles from './IconButton.css'

/**
 * Кнопка без видимого текста: удалить позицию, закрыть модалку, показать пароль.
 *
 * `label` обязателен — иконка сама по себе для скринридера пуста, поэтому
 * подпись всегда рендерится скрытым текстом и уходит в `aria-label`.
 */
export const IconButton: FC<IIconButtonProps & IBasicStyling> = ({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  disabled = false,
  onClick,
  className,
}) => (
  <button
    type={type}
    className={clsx(styles.container, styles.variant[variant], styles.size[size], className)}
    disabled={disabled}
    aria-label={label}
    onClick={onClick}
  >
    {icon}
    <VisuallyHidden>{label}</VisuallyHidden>
  </button>
)
