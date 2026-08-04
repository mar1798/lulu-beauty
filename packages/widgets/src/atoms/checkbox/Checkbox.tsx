import clsx from 'clsx'
import { type FC, useId } from 'react'
import type { ICheckboxProps, IBasicStyling } from '../../types'
import { IconCheck } from '../../svg/icons'
import * as styles from './Checkbox.css'

/**
 * Чекбокс: нативный `input` спрятан визуально, но именно он остаётся в
 * дереве доступности и в табуляции — рисуется поверх только коробка.
 * Подмена на `div role="checkbox"` стоила бы ручной поддержки клавиатуры.
 */
export const Checkbox: FC<ICheckboxProps & IBasicStyling> = ({
  checked,
  onChange,
  label,
  hint,
  id,
  name,
  disabled = false,
  className,
}) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <label
      className={clsx(styles.container, className)}
      htmlFor={fieldId}
      data-disabled={disabled}
    >
      <input
        id={fieldId}
        name={name}
        className={styles.input}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />

      <span className={styles.box} aria-hidden={true}>
        <IconCheck />
      </span>

      <span className={styles.body}>
        <span className={styles.label}>{label}</span>
        {hint !== undefined && <span className={styles.hint}>{hint}</span>}
      </span>
    </label>
  )
}
