import clsx from 'clsx'
import { type FC, useId, useRef, useState } from 'react'
import type { IBasicStyling, IFileInputProps } from '../../types'
import { IconUpload } from '../../svg/icons'
import { Button } from '../button'
import * as styles from './FileInput.css'

/**
 * Выбор файла: картинки товара и импорт каталога.
 *
 * Нативный `input[type=file]` спрятан, а клик по нему пробрасывается с
 * обычной кнопки. Именно кнопка, а не `<label>` вокруг инпута: label не
 * попадает в табуляцию, и выбрать файл с клавиатуры стало бы нельзя.
 */
export const FileInput: FC<IFileInputProps & IBasicStyling> = ({
  onSelect,
  accept,
  multiple = false,
  label,
  hint,
  error,
  buttonLabel = 'Выбрать файл',
  disabled = false,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const generatedId = useId()
  const errorId = `${generatedId}-error`
  const hintId = `${generatedId}-hint`
  const hasError = error !== undefined && error !== null && error !== ''

  return (
    <div className={clsx(styles.container, className)}>
      {label !== undefined && <span className={styles.label}>{label}</span>}

      <div className={styles.row}>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          iconStart={<IconUpload />}
          onClick={() => inputRef.current?.click()}
        >
          {buttonLabel}
        </Button>

        <input
          ref={inputRef}
          className={styles.input}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-label={label ?? buttonLabel}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : hint !== undefined ? hintId : undefined}
          onChange={event => {
            const files = Array.from(event.target.files ?? [])

            setSelected(files.map(file => file.name))
            onSelect(files)
            // Сброс, иначе повторный выбор того же файла не даст `change`.
            event.target.value = ''
          }}
        />

        {selected.length > 0 && <span className={styles.fileName}>{selected.join(', ')}</span>}
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
