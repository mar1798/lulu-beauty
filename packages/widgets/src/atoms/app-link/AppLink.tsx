import type { IBasicStyling, ILink, IWrapperComponent } from '../../types'
import { ServicesContext } from '../../contexts'

/**
 * Helper component to render a link. It uses Link component from the service container
 */
export const AppLink: React.FC<IWrapperComponent & ILink & IBasicStyling> = props => {
  const {
    components: { Link },
  } = ServicesContext.useContainer()
  return <Link {...props} />
}
