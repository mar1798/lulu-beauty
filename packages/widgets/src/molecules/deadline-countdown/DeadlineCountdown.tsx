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
 */

const URGENT_HOURS = 24

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

export const DeadlineCountdown: FC<IDeadlineCountdownProps & IBasicStyling> = ({
  deadlineAt,
  label = 'До закрытия сбора',
  expiredLabel = 'Сбор заказов закрыт',
  className,
}) => {
  const { days, hours, minutes, seconds, isExpired, isReady } = useCountdown(deadlineAt)

  if (!isReady) {
    // До гидратации текущего времени нет — заглушка вместо неверного «истёк».
    return (
      <div className={clsx(styles.container, className)}>
        <span className={styles.placeholder} aria-hidden={true} />
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

  const isUrgent = days === 0 && hours < URGENT_HOURS

  return (
    <div className={clsx(styles.container, className)}>
      <span className={styles.label}>{label}</span>
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
