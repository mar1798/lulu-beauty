import type { IBasicStyling, IImageComponentProps } from '../../types'
import { ServicesContext } from '../../contexts'

/**
 * Helper component to render an image. It uses Image component from the service container
 */
export const AppImage: React.FC<IBasicStyling & IImageComponentProps> = props => {
  const {
    components: { Image },
  } = ServicesContext.useContainer()
  return <Image {...props} />
}
