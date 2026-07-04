import type { IBasicStyling, IImageComponentProps } from '../../../types'
import { extractSizes } from '../../../utils'

export const Image: React.FC<IBasicStyling & IImageComponentProps> = ({
  className,
  sizes,
  image,
  priority,
}) => (
  <img
    className={className}
    width={image.width}
    decoding="async"
    height={image.height}
    loading={priority === true ? 'eager' : 'lazy'}
    alt={image.alt}
    src={typeof image.src === 'string' ? image.src : image.src.src}
    sizes={extractSizes(sizes)}
    title={image.title}
  />
)
