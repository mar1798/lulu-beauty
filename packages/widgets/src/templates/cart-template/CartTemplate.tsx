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
  titleDecor,
  decor,
  summary,
  breadcrumbs,
  children,
  className,
}) => (
  <Container as="section" className={clsx(styles.container, className)}>
    {breadcrumbs}

    <div className={styles.head}>
      <div className={styles.titleRow}>
        <Heading level={1}>{title}</Heading>
        {/* Нулевой высоты: декор не растягивает строку заголовка и не двигает страницу. */}
        {titleDecor !== undefined && <span className={styles.titleDecor}>{titleDecor}</span>}
      </div>
      {summary !== undefined && <Text tone="secondary">{summary}</Text>}
      {/*
        Слой сезонного декора на весь блок заголовка (он `relative`): места не занимает, клики
        не ловит, вне сезона пуст и скрыт. Рисунок внутри позиционирует тот, кто его передал.
      */}
      {decor !== undefined && (
        <div className={styles.decor} aria-hidden={true}>
          {decor}
        </div>
      )}
    </div>

    {children}
  </Container>
)
