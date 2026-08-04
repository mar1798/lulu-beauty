import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IProductTemplateProps } from '../../types'
import { Container } from '../../atoms/container'
import * as styles from './ProductTemplate.css'

/** Раскладка страницы товара: крошки, карточка товара, дополнительные секции. */
export const ProductTemplate: FC<IProductTemplateProps & IBasicStyling> = ({
  breadcrumbs,
  children,
  className,
}) => (
  <Container as="section" className={clsx(styles.container, className)}>
    {breadcrumbs}
    {children}
  </Container>
)
