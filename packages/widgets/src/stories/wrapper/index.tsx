import { domMax, LazyMotion } from 'motion/react'
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

/**
 * `LazyMotion` с движком сразу — в отличие от сайта (`MotionProvider`), где он
 * грузится отдельным чанком: без провайдера `m.*` застряли бы в начальном
 * состоянии, а ждать чанк в Storybook и тестах незачем.
 */
export const StoryWrapper: React.FC<IWrapperComponent> = ({ children }) => (
  <LazyMotion features={domMax} strict={true}>
    <ServicesContext.Provider initialState={services}>{children}</ServicesContext.Provider>
  </LazyMotion>
)
