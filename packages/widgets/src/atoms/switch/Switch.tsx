import clsx from 'clsx'
import { type FC, useId } from 'react'
import type { IBasicStyling, ISwitchProps } from '../../types'
import * as styles from './Switch.css'

/**
 * Тумблер: «в наличии» у товара, фильтры в админке.
 *
 * Под капотом тот же нативный чекбокс, что и у `Checkbox`, но с
 * `role="switch"` — семантика «включено/выключено» вместо «отмечено».
 */
export const Switch: FC<ISwitchProps & IBasicStyling> = ({
  checked,
  onChange,
  label,
  id,
  name,
  disabled = false,
  className,
}) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <label className={clsx(styles.container, className)} htmlFor={fieldId} data-disabled={disabled}>
      <input
        id={fieldId}
        name={name}
        className={styles.input}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />

      <span className={styles.track} aria-hidden={true}>
        <span className={styles.thumb} />
      </span>

      <span className={styles.label}>{label}</span>
    </label>
  )
}
