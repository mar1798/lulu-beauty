import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IPromotionBannerFieldProps } from '../../types'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { FileDropzone } from '../file-dropzone'
import { BANNER_ALLOWED_TYPES, BANNER_MAX_BYTES, BANNER_SPECS } from '../../utils/promotion'
import * as styles from './PromotionBannerField.css'

/**
 * Загрузка баннера акции: подпись с рекомендованным размером, превью в тех
 * пропорциях, в каких баннер встанет в карусель, и выбор файла.
 *
 * Превью — обычный `<img>`, а не `AppImage`: до сохранения акции выбранный файл
 * показывается по blob-адресу, и оптимизатору картинок он недоступен.
 *
 * Пустое превью тоже держит пропорцию: владелец видит рамку, под которую
 * готовить картинку, ещё до загрузки. Размер в подписи рекомендательный — бэкенд
 * принимает любую картинку и сжимает, а карусель обрезает по краям (`cover`).
 *
 * «Убрать» — текстовая кнопка: действие редкое и разрушительное, ему нужна
 * подпись; иконочными в этом разделе сделаны только действия строк таблицы.
 */
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
  const spec = BANNER_SPECS[variant]
  const hasBanner = url !== null

  return (
    <div className={clsx(styles.container, className)} data-variant={variant}>
      <div className={styles.head}>
        <span className={styles.title}>{spec.title}</span>
        {isRequired && <Badge tone="warning">Нужен для карусели</Badge>}
      </div>

      <p className={styles.spec}>
        Рекомендуем {spec.width}×{spec.height} px, соотношение {spec.ratioLabel}. Края могут
        обрезаться.
      </p>

      <div
        className={styles.frame}
        // Пропорция — значением, а не классом: у каждого варианта своя, и заводить под них стили незачем.
        style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
      >
        {hasBanner ? (
          <img className={styles.image} src={url} alt={`Баннер: ${spec.title.toLowerCase()}`} />
        ) : (
          <span className={styles.placeholder}>{spec.ratioLabel}</span>
        )}
      </div>

      <FileDropzone
        accept={BANNER_ALLOWED_TYPES.join(',')}
        allowedTypes={BANNER_ALLOWED_TYPES}
        maxBytes={BANNER_MAX_BYTES}
        label={`${spec.title} баннер`}
        hint="JPG, PNG или WebP, до 15 МБ"
        buttonLabel={hasBanner ? 'Заменить' : 'Выбрать файл'}
        error={error}
        disabled={isBusy}
        onSelect={onSelect}
      />

      {hasBanner && (
        <Button variant="ghost" size="sm" disabled={isBusy} onClick={onRemove}>
          Убрать баннер
        </Button>
      )}
    </div>
  )
}
