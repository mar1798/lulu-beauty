import {
  IBasicStyling,
  IImageComponentProps,
  ILink,
  IWrapperComponent,
} from '../types'
import { unmanagedContainer } from '../utils'

/**
 * Service container contexts. Use this contexts to get access to
 * the services and components injected by the application.
 */
export interface ServiceContainerContextProps {
  services: {}
  components: {
    Link: React.FC<IWrapperComponent & ILink & IBasicStyling>
    Image: React.FC<IBasicStyling & IImageComponentProps>
  }
}

export const ServicesContext = unmanagedContainer<ServiceContainerContextProps>()
