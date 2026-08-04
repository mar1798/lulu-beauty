import clsx from 'clsx'
import { type FC, useState } from 'react'
import type { IBasicStyling, IProductGalleryProps } from '../../types'
import { IconBox } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import * as styles from './ProductGallery.css'

/**
 * Галерея товара: большая картинка и миниатюры.
 *
 * Порядок берётся из `sortOrder`, а главной по умолчанию открывается
 * помеченная `isPrimary` — ровно так, как их сортирует и помечает админка.
 */

const MAIN_SIZES = { fb: '100vw', md: '50vw', lg: '40vw' } as const
const THUMB_SIZES = { fb: '72px' } as const

export const ProductGallery: FC<IProductGalleryProps & IBasicStyling> = ({
  images,
  productName,
  className,
}) => {
  const ordered = [...images].sort((left, right) => left.sortOrder - right.sortOrder)
  const primaryIndex = Math.max(
    ordered.findIndex(image => image.isPrimary),
    0
  )
  const [activeIndex, setActiveIndex] = useState(primaryIndex)
  const active = ordered[activeIndex] ?? null

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.main}>
        {active === null ? (
          <span className={styles.placeholder} aria-hidden={true}>
            <IconBox />
          </span>
        ) : (
          <AppImage
            image={{ src: active.url, alt: active.alt ?? productName }}
            sizes={MAIN_SIZES}
            fill={true}
            priority={true}
          />
        )}
      </div>

      {ordered.length > 1 && (
        <div className={styles.thumbs}>
          {ordered.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={styles.thumb}
              aria-current={index === activeIndex}
              aria-label={`Фотография ${index + 1} из ${ordered.length}`}
              onClick={() => setActiveIndex(index)}
            >
              <AppImage
                image={{ src: image.url, alt: image.alt ?? productName }}
                sizes={THUMB_SIZES}
                fill={true}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
