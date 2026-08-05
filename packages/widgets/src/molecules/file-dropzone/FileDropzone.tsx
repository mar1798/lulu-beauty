import clsx from 'clsx'
import { type DragEvent, type FC, useId, useRef, useState } from 'react'
import type { IBasicStyling, IFileDropzoneProps } from '../../types'
import { IconUpload } from '../../svg/icons'
import { Button } from '../../atoms/button'
import * as styles from './FileDropzone.css'

/**
 * Перетаскивание файла (или выбор кнопкой) с проверкой ограничений до отправки.
 *
 * Тип и размер проверяются здесь, а не только на бэкенде: 10-мегабайтный
 * xlsx уезжает на сервер несколько секунд, и отказ «файл слишком большой»
 * после ожидания выглядит как поломка. Значения лимитов задаются пропсами и
 * повторяют `apps/api/app/catalog/router.py` — дублировать их константами
 * внутри виджета нельзя, лимиты у картинок и импорта разные.
 */

const BYTES_IN_MB = 1024 * 1024

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')

  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

const formatLimit = (bytes: number): string =>
  `${Number((bytes / BYTES_IN_MB).toFixed(1))} МБ`

export const FileDropzone: FC<IFileDropzoneProps & IBasicStyling> = ({
  onSelect,
  accept,
  allowedTypes,
  allowedExtensions,
  maxBytes,
  label,
  hint,
  error,
  disabled = false,
  buttonLabel = 'Выбрать файл',
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const generatedId = useId()
  const messageId = `${generatedId}-message`

  const shownError = error ?? localError
  const hasError = shownError !== null && shownError !== ''

  const validate = (file: File): string | null => {
    if (
      allowedTypes !== undefined &&
      allowedTypes.length > 0 &&
      !allowedTypes.includes(file.type)
    ) {
      return 'Неподдерживаемый формат файла.'
    }

    if (
      allowedExtensions !== undefined &&
      allowedExtensions.length > 0 &&
      !allowedExtensions.includes(extensionOf(file.name))
    ) {
      return `Подойдёт файл ${allowedExtensions.join(' или ')}.`
    }

    if (maxBytes !== undefined && file.size > maxBytes) {
      return `Файл больше ${formatLimit(maxBytes)}.`
    }

    return null
  }

  const handleFile = (file: File | undefined): void => {
    if (file === undefined) {
      return
    }

    const problem = validate(file)

    setLocalError(problem)
    setSelectedName(problem === null ? file.name : null)

    if (problem === null) {
      onSelect(file)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setIsOver(false)

    if (!disabled) {
      handleFile(event.dataTransfer.files[0])
    }
  }

  return (
    <div className={clsx(styles.container, className)}>
      {label !== undefined && <span className={styles.label}>{label}</span>}

      {/*
        Зона перетаскивания — не кнопка и не `label`: она нужна только мыши.
        Клавиатурный путь целиком лежит на кнопке внутри, поэтому у самой
        зоны нет ни tabindex, ни роли — иначе в обходе появился бы лишний
        элемент, который ничего не делает по Enter.
      */}
      <div
        className={clsx(
          styles.zone,
          isOver && styles.zoneOver,
          hasError && styles.zoneInvalid,
          disabled && styles.zoneDisabled
        )}
        onDragOver={event => {
          event.preventDefault()

          if (!disabled) {
            setIsOver(true)
          }
        }}
        onDragLeave={() => {
          setIsOver(false)
        }}
        onDrop={onDrop}
      >
        <IconUpload className={styles.icon} />

        <span className={styles.prompt}>
          Перетащите файл сюда или выберите на устройстве
        </span>

        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {buttonLabel}
        </Button>

        <input
          ref={inputRef}
          className={styles.input}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-label={label ?? buttonLabel}
          aria-invalid={hasError}
          aria-describedby={messageId}
          onChange={event => {
            handleFile(event.target.files?.[0])
            // Сброс, иначе повторный выбор того же файла не даст `change`.
            event.target.value = ''
          }}
        />
      </div>

      <span className={clsx(hasError ? styles.error : styles.hint)} id={messageId}>
        {hasError ? shownError : (selectedName ?? hint)}
      </span>
    </div>
  )
}
