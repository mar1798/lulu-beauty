import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IIconButtonProps } from '../../types'
import { Spinner } from '../spinner'
import { VisuallyHidden } from '../visually-hidden'
import * as styles from './IconButton.css'

/**
 * Кнопка без видимого текста: удалить позицию, закрыть модалку, показать пароль.
 *
 * `label` обязателен — иконка сама по себе для скринридера пуста, поэтому
 * подпись всегда рендерится скрытым текстом и уходит в `aria-label`.
 *
 * `isLoading` подменяет иконку спиннером: размер кнопки задан классом, поэтому
 * подмена не меняет раскладку. Без него единственным признаком запроса
 * оставалось бы приглушение — то же, чем выглядит «нажимать нельзя».
 */
export const IconButton: FC<IIconButtonProps & IBasicStyling> = ({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  disabled = false,
  isLoading = false,
  onClick,
  className,
}) => (
  <button
    type={type}
    className={clsx(styles.container, styles.variant[variant], styles.size[size], className)}
    disabled={disabled || isLoading}
    aria-busy={isLoading}
    aria-label={label}
    onClick={onClick}
  >
    {isLoading ? <Spinner size="sm" label={null} /> : icon}
    <VisuallyHidden>{label}</VisuallyHidden>
  </button>
)
