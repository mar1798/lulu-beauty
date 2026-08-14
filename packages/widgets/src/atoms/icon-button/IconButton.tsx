import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IIconButtonProps } from '../../types'
import { AppLink } from '../app-link'
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
 *
 * `link` — ссылочный режим, как у `Button`: переход обязан оставаться ссылкой
 * (новая вкладка, история), даже когда выглядит одной иконкой в ряду кнопок.
 */
export const IconButton: FC<IIconButtonProps & IBasicStyling> = ({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  disabled = false,
  isLoading = false,
  link,
  onClick,
  unavailableReason = null,
  className,
}) => {
  const isUnavailable = unavailableReason !== null && unavailableReason !== ''
  const accessibleLabel = isUnavailable ? `${label} — ${unavailableReason}` : label
  const classes = clsx(
    styles.container,
    styles.variant[variant],
    styles.size[size],
    className
  )
  const content = (
    <>
      {isLoading ? <Spinner size="sm" label={null} /> : icon}
      <VisuallyHidden>{accessibleLabel}</VisuallyHidden>
    </>
  )

  if (link !== undefined) {
    return (
      <AppLink
        {...link}
        className={classes}
        aria-label={accessibleLabel}
        aria-disabled={disabled || isLoading || isUnavailable ? true : undefined}
      >
        {content}
      </AppLink>
    )
  }

  return (
    <button
      // `aria-disabled` браузер не считает выключением, поэтому `submit` снимается вручную.
      type={isUnavailable ? 'button' : type}
      className={classes}
      disabled={isUnavailable ? undefined : disabled || isLoading}
      aria-disabled={isUnavailable ? true : undefined}
      aria-busy={isLoading}
      aria-label={accessibleLabel}
      onClick={isUnavailable ? undefined : onClick}
    >
      {content}
    </button>
  )
}
