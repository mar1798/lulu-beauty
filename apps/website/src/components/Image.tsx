import React from 'react'
import NextImage from 'next/image'
import type { IBasicStyling, IImage, IImageComponentProps } from 'widgets/types'
import { extractSizes } from 'widgets/utils'
import { publicConfig } from '@/сonfig'

/**
 * Адаптер `components.Image` для `ServicesContext` — вторая реализация той же
 * заглушки, что живёт в Storybook (`src/stories/wrapper/components/Image.tsx`).
 *
 * У картинок товара нет ни ширины, ни высоты: API отдаёт только `url`/`alt`.
 * `next/image` без размеров работать отказывается, поэтому такие картинки
 * автоматически уходят в режим `fill` — родитель обязан быть `position: relative`
 * с заданной пропорцией (так и сделано в `ProductCard`/`ProductGallery`).
 */
const API_BASE_URL = publicConfig('apiBaseUrl')

/**
 * `http://api-host/files/x.png` → `/files/x.png`.
 *
 * Картинки товаров отдаются через рерайт самого Next (см. `next.config.js`):
 * оптимизатор Next 16 не ходит на хосты с приватным IP, а в проде так ещё и
 * не нужно светить адрес API. Чужие абсолютные адреса остаются как есть.
 */
const sameOriginSrc = (src: IImage['src']): IImage['src'] => {
  if (typeof src !== 'string' || !src.startsWith(`${API_BASE_URL}/files/`)) {
    return src
  }

  return src.slice(API_BASE_URL.length)
}

export const Image: React.FC<IBasicStyling & IImageComponentProps> = ({
  className,
  image,
  sizes,
  priority,
  fill,
  onError,
}) => {
  const hasSize = image.width !== undefined && image.height !== undefined
  const useFill = fill === true || !hasSize

  return (
    <NextImage
      className={className}
      src={sameOriginSrc(image.src)}
      alt={image.alt}
      title={image.title}
      sizes={extractSizes(sizes)}
      priority={priority}
      onError={onError}
      {...(useFill
        ? { fill: true, style: { objectFit: 'cover' as const } }
        : { width: image.width, height: image.height })}
    />
  )
}
