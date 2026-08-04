import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICartTemplateProps } from '../../types'
import { Container } from '../../atoms/container'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './CartTemplate.css'

/** Раскладка корзины и оформления: заголовок, подпись, содержимое. */
export const CartTemplate: FC<ICartTemplateProps & IBasicStyling> = ({
  title,
  summary,
  breadcrumbs,
  children,
  className,
}) => (
  <Container as="section" className={clsx(styles.container, className)}>
    {breadcrumbs}

    <div className={styles.head}>
      <Heading level={1}>{title}</Heading>
      {summary !== undefined && <Text tone="secondary">{summary}</Text>}
    </div>

    {children}
  </Container>
)
