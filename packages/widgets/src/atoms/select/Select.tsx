import clsx from 'clsx'
import { type FC, useId } from 'react'
import type { IBasicStyling, ISelectProps } from '../../types'
import { IconChevronDown } from '../../svg/icons'
import * as styles from './Select.css'

/**
 * Выпадающий список на нативном `<select>`: категория товара, статус заявки.
 *
 * Нативный, а не самописный, сознательно — на мобильных он открывается
 * системным пикером, который удобнее любого кастомного списка, и бесплатно
 * приносит клавиатуру и скринридер.
 */
export const Select: FC<ISelectProps & IBasicStyling> = ({
  value,
  onChange,
  options,
  id,
  name,
  label,
  ariaLabel,
  hint,
  error,
  placeholder,
  disabled = false,
  required = false,
  className,
}) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const hasError = error !== undefined && error !== null && error !== ''

  const describedBy =
    [hasError ? errorId : null, hint !== undefined ? hintId : null].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className={clsx(styles.container, className)}>
      {label !== undefined && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}

      <div className={styles.shell}>
        <select
          id={fieldId}
          name={name}
          className={clsx(styles.control, hasError && styles.invalid)}
          value={value}
          disabled={disabled}
          required={required}
          aria-label={label === undefined ? ariaLabel : undefined}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          onChange={event => onChange(event.target.value)}
        >
          {placeholder !== undefined && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}

          {options.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <IconChevronDown className={styles.chevron} />
      </div>

      {hasError ? (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      ) : (
        hint !== undefined && (
          <span className={styles.hint} id={hintId}>
            {hint}
          </span>
        )
      )}
    </div>
  )
}
