import clsx from 'clsx'
import { type FC, useId } from 'react'
import type { IBasicStyling, IInputProps } from '../../types'
import * as styles from './Input.css'

/**
 * Текстовое поле с подписью, подсказкой и ошибкой.
 *
 * Ошибка и подсказка связаны с полем через `aria-describedby`, а не просто
 * лежат рядом: иначе скринридер прочитает подпись и молча пропустит причину,
 * по которой форма не отправилась. `id` генерируется автоматически, но его
 * можно задать снаружи — например, чтобы навести фокус после ответа сервера.
 *
 * Полю без видимой подписи имя даёт `ariaLabel`: placeholder именем не
 * считается — он исчезает при первом же символе, а часть скринридеров его
 * и вовсе не читает. При заданном `label` он игнорируется, иначе перебил бы
 * подпись, уже связанную через `htmlFor`.
 */
export const Input: FC<IInputProps & IBasicStyling> = ({
  value,
  onChange,
  id,
  name,
  label,
  ariaLabel,
  hint,
  error,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  disabled = false,
  required = false,
  readOnly = false,
  prefix,
  suffix,
  onBlur,
  onFocus,
  onKeyDown,
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

      <div
        className={clsx(styles.shell, hasError && styles.invalid, disabled && styles.disabled)}
      >
        {prefix !== undefined && <span className={styles.affix}>{prefix}</span>}

        <input
          id={fieldId}
          name={name}
          className={styles.input}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          disabled={disabled}
          required={required}
          readOnly={readOnly}
          aria-label={label === undefined ? ariaLabel : undefined}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          onChange={event => onChange(event.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />

        {suffix !== undefined && <span className={styles.affix}>{suffix}</span>}
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
