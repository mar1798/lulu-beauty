import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ITooltipProps } from '../../types'
import * as styles from './Tooltip.css'

/**
 * Подсказка над триггером: всплывает на наведении и на фокусе внутри обёртки.
 *
 * Без состояния и без портала — всё держит CSS (`:hover`/`:focus-within`).
 * Портал понадобился бы, только если бы подсказку обрезал предок с
 * `overflow: hidden`; ни один из нынешних потребителей таким не является.
 *
 * Пузырь скрыт от скринридера (`aria-hidden`): вставить `aria-describedby` в
 * произвольный `children` нельзя, а подсказка без связи с триггером читалась бы
 * как оторванный от всего текст. Поэтому тот же текст обязан попадать в
 * доступное имя самого триггера — так это делают `Button`/`IconButton`
 * (`unavailableReason` уходит в скрытую подпись внутри кнопки).
 */
export const Tooltip: FC<ITooltipProps & IBasicStyling> = ({
  content,
  children,
  placement = 'top',
  isBlock = false,
  className,
}) => (
  <span className={clsx(styles.container, isBlock && styles.block, className)}>
    {children}

    <span
      role="tooltip"
      aria-hidden={true}
      className={clsx(styles.bubble, styles.placement[placement])}
    >
      {content}
    </span>
  </span>
)
