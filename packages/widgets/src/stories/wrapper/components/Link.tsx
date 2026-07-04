import type { IBasicStyling, ILink, IWrapperComponent } from '../../../types'

export const Link: React.FC<IWrapperComponent & ILink & IBasicStyling> = ({
  children,
  className,
  ...props
}) => (
  <a {...props} data-storybook-link={true} className={className}>
    {children}
  </a>
)
