import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IButtonProps } from '../../types'
import { AppLink } from '../app-link'
import { Spinner } from '../spinner'
import * as styles from './Button.css'

/**
 * Основная кнопка. В ссылочном режиме (`link`) рендерится через `AppLink`,
 * то есть уходит в `next/link` на сайте и в обычную `<a>` в Storybook,
 * сохраняя ту же внешность.
 *
 * `isLoading` одновременно блокирует кнопку и выставляет `aria-busy`:
 * повторная отправка формы по двойному клику — самая частая ошибка,
 * а скринридеру нужно объяснить, почему кнопка перестала отвечать.
 *
 * Спиннер не встаёт в поток, а накрывает содержимое: иначе он раздвигал бы
 * кнопку на свою ширину прямо под курсором — клик по «Оформить заявку»
 * заканчивался бы прыжком кнопки и соседей по строке.
 */
export const Button: FC<IButtonProps & IBasicStyling> = ({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  isLoading = false,
  disabled = false,
  isFullWidth = false,
  iconStart,
  iconEnd,
  link,
  onClick,
  className,
}) => {
  const isBlocked = disabled || isLoading
  const classes = clsx(
    styles.container,
    styles.variant[variant],
    styles.size[size],
    isFullWidth && styles.fullWidth,
    className
  )

  const content = (
    <>
      <span className={clsx(styles.content, isLoading && styles.contentHidden)}>
        {iconStart !== undefined && <span className={styles.icon}>{iconStart}</span>}
        <span>{children}</span>
        {iconEnd !== undefined && <span className={styles.icon}>{iconEnd}</span>}
      </span>

      {/* `label={null}` — про занятость уже сказал `aria-busy` самой кнопки. */}
      {isLoading && (
        <span className={styles.loader}>
          <Spinner size="sm" label={null} />
        </span>
      )}
    </>
  )

  if (link !== undefined) {
    return (
      <AppLink {...link} className={classes} aria-disabled={isBlocked ? true : undefined}>
        {content}
      </AppLink>
    )
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={isBlocked}
      aria-busy={isLoading}
      onClick={onClick}
    >
      {content}
    </button>
  )
}
