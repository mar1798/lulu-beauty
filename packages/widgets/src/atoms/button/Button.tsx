import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IButtonProps } from '../../types'
import { AppLink } from '../app-link'
import { Spinner } from '../spinner'
import { VisuallyHidden } from '../visually-hidden'
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
 *
 * `unavailableReason` — недоступность **с объяснением**: выглядит как
 * `disabled`, но кнопка остаётся фокусируемой (`aria-disabled`), чтобы
 * подсказка над ней всплывала и с клавиатуры. Причина уходит скрытой подписью
 * внутрь кнопки — иначе скринридер сообщил бы, что нажать нельзя, и умолчал,
 * почему.
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
  unavailableReason = null,
  className,
}) => {
  const isUnavailable = unavailableReason !== null && unavailableReason !== ''
  const isBlocked = disabled || isLoading || isUnavailable
  const classes = clsx(
    styles.container,
    styles.variant[variant],
    styles.size[size],
    isFullWidth === true && styles.fullWidth,
    isFullWidth === 'mobile' && styles.fullWidthMobile,
    className
  )

  const content = (
    <>
      <span className={clsx(styles.content, isLoading && styles.contentHidden)}>
        {iconStart !== undefined && <span className={styles.icon}>{iconStart}</span>}
        <span>{children}</span>
        {iconEnd !== undefined && <span className={styles.icon}>{iconEnd}</span>}
      </span>

      {isUnavailable && <VisuallyHidden>{unavailableReason}</VisuallyHidden>}

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
      /*
        `submit` тоже снимается: `aria-disabled` — это только для скринридера,
        браузер по нему форму отправлять не перестанет.
      */
      type={isUnavailable ? 'button' : type}
      className={classes}
      /*
        Недоступная «с объяснением» кнопка не выключается по-настоящему: она
        должна принимать фокус, иначе причину не увидит никто, кроме мыши.
        Клик при этом всё равно никуда не идёт.
      */
      disabled={isUnavailable ? undefined : isBlocked}
      aria-disabled={isUnavailable ? true : undefined}
      aria-busy={isLoading}
      onClick={isUnavailable ? undefined : onClick}
    >
      {content}
    </button>
  )
}
