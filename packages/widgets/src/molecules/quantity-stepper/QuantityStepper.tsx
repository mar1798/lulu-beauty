import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IQuantityStepperProps } from '../../types'
import { VisuallyHidden } from '../../atoms/visually-hidden'
import * as styles from './QuantityStepper.css'

/**
 * Количество товара: `− n +`.
 *
 * Число выводится текстом, а не полем ввода: бэкенд принимает только целое
 * `quantity >= 1`, а свободный ввод пришлось бы валидировать и защищать от
 * пустого значения ради сценария, которого в корзине почти не бывает.
 * Уменьшение ниже `min` не блокируется молча — кнопка отключается.
 */

const DEFAULT_MIN = 1
const DEFAULT_MAX = 999

export const QuantityStepper: FC<IQuantityStepperProps & IBasicStyling> = ({
  value,
  onChange,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  disabled = false,
  label = 'Количество',
  className,
}) => (
  <div className={clsx(styles.container, className)} role="group" aria-label={label}>
    <button
      type="button"
      className={styles.button}
      disabled={disabled || value <= min}
      onClick={() => onChange(value - 1)}
    >
      −<VisuallyHidden>Уменьшить количество</VisuallyHidden>
    </button>

    <span className={styles.value} aria-live="polite">
      {value}
      <VisuallyHidden>{` ${label}`}</VisuallyHidden>
    </span>

    <button
      type="button"
      className={styles.button}
      disabled={disabled || value >= max}
      onClick={() => onChange(value + 1)}
    >
      +<VisuallyHidden>Увеличить количество</VisuallyHidden>
    </button>
  </div>
)
