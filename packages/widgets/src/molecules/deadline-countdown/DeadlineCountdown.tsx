import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IDeadlineCountdownProps } from '../../types'
import { useCountdown } from '../../hooks'
import * as styles from './DeadlineCountdown.css'

/**
 * Сколько осталось до закрытия сбора заказов.
 *
 * Секунды показываются только на последнем часе: на «двух днях» они лишь
 * мельтешат, а вот в конце по ним и правда принимают решение.
 *
 * `variant` по умолчанию `inline`, поэтому корзина, чекаут и админка не
 * меняются вовсе — это обязательное условие правки. `blocks` — крупные
 * блоки «дн / час / мин» для `StatusPanel` в герое.
 */

/**
 * Порог «меньше суток». Экспортируется: страница по нему же поднимает
 * `tone="urgent"` у панели героя — правило одно, а не два.
 */
export const DEADLINE_URGENT_HOURS = 24

const pad = (value: number): string => String(value).padStart(2, '0')

const formatLeft = (days: number, hours: number, minutes: number, seconds: number): string => {
  if (days > 0) {
    return `${days} д ${pad(hours)} ч ${pad(minutes)} мин`
  }

  if (hours > 0) {
    return `${pad(hours)} ч ${pad(minutes)} мин`
  }

  return `${pad(minutes)}:${pad(seconds)}`
}

interface IBlock {
  value: string
  unit: string
}

const toBlocks = (days: number, hours: number, minutes: number, seconds: number): IBlock[] => {
  const blocks: IBlock[] = [
    { value: String(days), unit: 'дн' },
    { value: pad(hours), unit: 'час' },
    { value: pad(minutes), unit: 'мин' },
  ]

  // Секунды — только на последнем часе, тем же правилом, что у `formatLeft`.
  if (days === 0 && hours === 0) {
    blocks.push({ value: pad(seconds), unit: 'сек' })
  }

  return blocks
}

export const DeadlineCountdown: FC<IDeadlineCountdownProps & IBasicStyling> = ({
  deadlineAt,
  label = 'До закрытия сбора',
  expiredLabel = 'Сбор заказов закрыт',
  variant = 'inline',
  isLabelHidden = false,
  className,
}) => {
  const { days, hours, minutes, seconds, isExpired, isReady } = useCountdown(deadlineAt)
  const isBlocks = variant === 'blocks'

  if (!isReady) {
    // До гидратации текущего времени нет — заглушка вместо неверного «истёк».
    return (
      <div className={clsx(styles.container, className)}>
        <span
          className={clsx(styles.placeholder, isBlocks && styles.placeholderBlocks)}
          aria-hidden={true}
        />
      </div>
    )
  }

  if (isExpired) {
    return (
      <div className={clsx(styles.container, className)}>
        <span className={clsx(styles.value, styles.tone.expired)}>{expiredLabel}</span>
      </div>
    )
  }

  const isUrgent = days === 0 && hours < DEADLINE_URGENT_HOURS

  if (isBlocks) {
    return (
      <div className={clsx(styles.containerBlocks, className)}>
        {!isLabelHidden && <span className={styles.label}>{label}</span>}

        {/* Секунды меняются каждый тик — их незачем зачитывать вслух. */}
        <span className={styles.blocks} aria-live="off">
          {toBlocks(days, hours, minutes, seconds).map((block, index) => (
            <span
              key={block.unit}
              className={clsx(styles.block, index > 0 && styles.blockDivided)}
            >
              <span className={clsx(styles.digit, isUrgent && styles.digitUrgent)}>
                {block.value}
              </span>
              <span className={styles.unit}>{block.unit}</span>
            </span>
          ))}
        </span>
      </div>
    )
  }

  return (
    <div className={clsx(styles.container, className)}>
      {!isLabelHidden && <span className={styles.label}>{label}</span>}
      <span
        className={clsx(styles.value, isUrgent ? styles.tone.urgent : styles.tone.normal)}
        // Секунды меняются каждый тик — их незачем зачитывать вслух.
        aria-live="off"
      >
        {formatLeft(days, hours, minutes, seconds)}
      </span>
    </div>
  )
}
