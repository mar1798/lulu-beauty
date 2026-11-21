import clsx from 'clsx'
import { type FC, useId, useRef, useState } from 'react'
import type { IBasicStyling, IPromotionBannerFieldProps } from '../../types'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { BANNER_ALLOWED_TYPES, BANNER_MAX_BYTES, BANNER_SPECS } from '../../utils/promotion'
import * as styles from './PromotionBannerField.css'

/**
 * Загрузка баннера акции: подпись с рекомендованным размером и рамка в тех
 * пропорциях, в каких баннер встанет в карусель. Кнопка выбора файла стоит
 * прямо в рамке — перетаскивания нет: баннер загружают раз на акцию, и зона
 * для мыши занимала бы место дважды (рядом с такой же рамкой превью).
 *
 * Превью — обычный `<img>`, а не `AppImage`: до сохранения акции выбранный файл
 * показывается по blob-адресу, и оптимизатору картинок он недоступен.
 *
 * Пустая рамка тоже держит пропорцию: владелец видит, под какой кадр готовить
 * картинку, ещё до загрузки. Размер в подписи рекомендательный — бэкенд
 * принимает любую картинку и сжимает, а карусель обрезает по краям (`cover`).
 *
 * Тип и размер проверяются до отправки (`BANNER_ALLOWED_TYPES`,
 * `BANNER_MAX_BYTES` повторяют API): 15-мегабайтный файл едет на сервер
 * долго, и отказ после ожидания выглядит как поломка.
 *
 * «Убрать» — текстовая кнопка: действие редкое и разрушительное, ему нужна
 * подпись; иконочными в этом разделе сделаны только действия строк таблицы.
 */

const BYTES_IN_MB = 1024 * 1024

const validate = (file: File): string | null => {
  if (!BANNER_ALLOWED_TYPES.includes(file.type)) {
    return 'Подойдёт JPG, PNG или WebP'
  }

  if (file.size > BANNER_MAX_BYTES) {
    return `Файл больше ${Math.round(BANNER_MAX_BYTES / BYTES_IN_MB)} МБ`
  }

  return null
}

export const PromotionBannerField: FC<IPromotionBannerFieldProps & IBasicStyling> = ({
  variant,
  url,
  onSelect,
  onRemove,
  isBusy = false,
  error = null,
  isRequired = false,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const messageId = `${useId()}-message`
  const spec = BANNER_SPECS[variant]
  const hasBanner = url !== null
  const shownError = error ?? localError
  const hasError = shownError !== null && shownError !== ''

  const handleFile = (file: File | undefined): void => {
    if (file === undefined) {
      return
    }

    const problem = validate(file)

    setLocalError(problem)

    if (problem === null) {
      onSelect(file)
    }
  }

  return (
    <div className={clsx(styles.container, className)} data-variant={variant}>
      <div className={styles.head}>
        <span className={styles.title}>{spec.title}</span>
        {isRequired && <Badge tone="warning">Нужен для карусели</Badge>}
      </div>

      <p className={styles.spec}>
        Рекомендуем {spec.width}×{spec.height} px, соотношение {spec.ratioLabel}. JPG, PNG или
        WebP, до {Math.round(BANNER_MAX_BYTES / BYTES_IN_MB)} МБ. Края могут обрезаться.
      </p>

      <div
        className={clsx(styles.frame, hasError && styles.frameInvalid)}
        // Пропорция — значением, а не классом: у каждого варианта своя, и заводить под них стили незачем.
        style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
      >
        {hasBanner ? (
          <img className={styles.image} src={url} alt={`Баннер: ${spec.title.toLowerCase()}`} />
        ) : (
          <span className={styles.placeholder}>{spec.ratioLabel}</span>
        )}

        <Button
          className={hasBanner ? styles.pickOverImage : undefined}
          variant="secondary"
          size="sm"
          disabled={isBusy}
          aria-describedby={hasError ? messageId : undefined}
          onClick={() => inputRef.current?.click()}
        >
          {hasBanner ? 'Заменить' : 'Выбрать файл'}
        </Button>

        <input
          ref={inputRef}
          className={styles.input}
          // Диалог открывает кнопка — своя точка входа в обходе Tab инпуту не нужна.
          tabIndex={-1}
          type="file"
          accept={BANNER_ALLOWED_TYPES.join(',')}
          disabled={isBusy}
          aria-label={`${spec.title} баннер`}
          aria-invalid={hasError}
          onChange={event => {
            handleFile(event.target.files?.[0])
            // Сброс, иначе повторный выбор того же файла не даст `change`.
            event.target.value = ''
          }}
        />
      </div>

      {hasError && (
        <span className={styles.error} id={messageId} role="alert">
          {shownError}
        </span>
      )}

      {hasBanner && (
        <Button variant="ghost" size="sm" disabled={isBusy} onClick={onRemove}>
          Убрать баннер
        </Button>
      )}
    </div>
  )
}
