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
 *
 * `unavailableReason` — недоступность с объяснением: в отличие от `disabled`,
 * кнопка остаётся фокусируемой, чтобы подсказка над ней открывалась и с
 * клавиатуры, а сама причина дописывается к подписи для скринридера.
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
  unavailableReason = null,
  className,
}) => {
  const isUnavailable = unavailableReason !== null && unavailableReason !== ''
  const accessibleLabel = isUnavailable ? `${label} — ${unavailableReason}` : label

  return (
    <button
      // `aria-disabled` браузер не считает выключением, поэтому `submit` снимается вручную.
      type={isUnavailable ? 'button' : type}
      className={clsx(styles.container, styles.variant[variant], styles.size[size], className)}
      disabled={isUnavailable ? undefined : disabled || isLoading}
      aria-disabled={isUnavailable ? true : undefined}
      aria-busy={isLoading}
      aria-label={accessibleLabel}
      onClick={isUnavailable ? undefined : onClick}
    >
      {isLoading ? <Spinner size="sm" label={null} /> : icon}
      <VisuallyHidden>{accessibleLabel}</VisuallyHidden>
    </button>
  )
}
