import clsx from 'clsx'
import { type FC, useId } from 'react'
import type { IBasicStyling, ITextareaProps } from '../../types'
import * as styles from './Textarea.css'

/**
 * Многострочное поле: комментарий к заявке и описание товара в админке.
 *
 * Со счётчиком символов, когда задан `maxLength` — у `note` на бэке жёсткий
 * лимит 2000, и упереться в него молча (браузер просто перестаёт печатать)
 * хуже, чем видеть остаток.
 */
export const Textarea: FC<ITextareaProps & IBasicStyling> = ({
  value,
  onChange,
  id,
  name,
  label,
  hint,
  error,
  placeholder,
  rows = 4,
  maxLength,
  disabled = false,
  required = false,
  onBlur,
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

      <textarea
        id={fieldId}
        name={name}
        className={clsx(styles.control, hasError && styles.invalid)}
        value={value}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        onChange={event => onChange(event.target.value)}
        onBlur={onBlur}
      />

      <div className={styles.footer}>
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

        {maxLength !== undefined && (
          <span className={styles.counter}>{`${value.length} / ${maxLength}`}</span>
        )}
      </div>
    </div>
  )
}
