import clsx from 'clsx'
import { type ClipboardEvent, type FC, type KeyboardEvent, useId, useRef } from 'react'
import type { IBasicStyling, IOtpInputProps } from '../../types'
import * as styles from './OtpInput.css'

/**
 * Ввод кода из Telegram: отдельная ячейка на цифру.
 *
 * Код почти всегда вставляют целиком из уведомления, поэтому вставка
 * обрабатывается в любую ячейку и разливается по всем сразу — без этого
 * поле из шести `input` превращается в пытку. Наружу отдаётся обычная
 * строка цифр, а не массив.
 */

const DEFAULT_LENGTH = 6

export const OtpInput: FC<IOtpInputProps & IBasicStyling> = ({
  value,
  onChange,
  onComplete,
  length = DEFAULT_LENGTH,
  label,
  error,
  disabled = false,
  autoFocus = false,
  className,
}) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const generatedId = useId()
  const errorId = `${generatedId}-error`
  const hasError = error !== undefined && error !== null && error !== ''
  const chars = Array.from({ length }, (_, index) => value[index] ?? '')

  const focusCell = (index: number): void => {
    inputs.current[Math.min(Math.max(index, 0), length - 1)]?.focus()
  }

  const emit = (next: string): void => {
    onChange(next)

    if (next.length === length) {
      onComplete?.(next)
    }
  }

  /** Раскладывает пачку цифр начиная с указанной ячейки. */
  const fillFrom = (start: number, digits: string): void => {
    const next = [...chars]

    for (let offset = 0; offset < digits.length && start + offset < length; offset += 1) {
      next[start + offset] = digits[offset]
    }

    emit(next.join(''))
    focusCell(start + digits.length)
  }

  const handleChange = (index: number, raw: string): void => {
    const digits = raw.replace(/\D/g, '')

    if (digits === '') {
      const next = [...chars]

      next[index] = ''
      emit(next.join(''))
      return
    }

    if (digits.length > 1) {
      fillFrom(index, digits)
      return
    }

    const next = [...chars]

    next[index] = digits
    emit(next.join(''))
    focusCell(index + 1)
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Backspace' && chars[index] === '') {
      event.preventDefault()
      focusCell(index - 1)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusCell(index - 1)
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusCell(index + 1)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '')

    if (digits === '') {
      return
    }

    event.preventDefault()
    fillFrom(0, digits.slice(0, length))
  }

  return (
    <div className={clsx(styles.container, className)}>
      {label !== undefined && <span className={styles.label}>{label}</span>}

      <div className={styles.cells} role="group" aria-label={label ?? 'Код из Telegram'}>
        {chars.map((char, index) => (
          <input
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            ref={element => {
              inputs.current[index] = element
            }}
            className={clsx(styles.cell, hasError && styles.invalid)}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={char}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`Цифра ${index + 1}`}
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : undefined}
            onChange={event => handleChange(index, event.target.value)}
            onKeyDown={event => handleKeyDown(index, event)}
            onPaste={handlePaste}
          />
        ))}
      </div>

      {hasError && (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
