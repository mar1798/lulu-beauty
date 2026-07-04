import type { IWrapperComponent } from '../../types'
import { ServicesContext } from '../../contexts'
import { Link } from './components/Link'
import { Image } from './components/Image'

const services = {
  services: {},
  components: {
    Link,
    Image,
  },
} as const

export const StoryWrapper: React.FC<IWrapperComponent> = ({ children }) => (
  <ServicesContext.Provider initialState={services}>{children}</ServicesContext.Provider>
)
