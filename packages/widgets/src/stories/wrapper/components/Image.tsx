import type { CSSProperties } from 'react'
import type { IBasicStyling, IImageComponentProps } from '../../../types'
import { extractSizes } from '../../../utils'

/**
 * Режим `fill`: картинка растягивается по родителю, который обязан быть
 * `position: relative` с заданной высотой или `aspect-ratio`.
 */
const fillStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  // Как и в `apps/website/src/components/Image.tsx`: картинка товара не обрезается.
  objectFit: 'contain',
}

/**
 * Заглушка `components.Image` для Storybook. Вторая реализация — адаптер
 * поверх `next/image` в `apps/website`; обе обязаны одинаково обрабатывать
 * режим `fill`.
 */
export const Image: React.FC<IBasicStyling & IImageComponentProps> = ({
  className,
  sizes,
  image,
  priority,
  fill,
  onError,
}) => (
  <img
    className={className}
    width={fill === true ? undefined : image.width}
    decoding="async"
    height={fill === true ? undefined : image.height}
    loading={priority === true ? 'eager' : 'lazy'}
    alt={image.alt}
    src={typeof image.src === 'string' ? image.src : image.src.src}
    sizes={extractSizes(sizes)}
    style={fill === true ? fillStyle : undefined}
    title={image.title}
    onError={onError}
  />
)
