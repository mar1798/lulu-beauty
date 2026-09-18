import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICatalogTemplateProps } from '../../types'
import { Container } from '../../atoms/container'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './CatalogTemplate.css'

/**
 * Раскладка витрины: заголовок, строка управления (поиск + фильтр), сетка,
 * пагинация.
 *
 * Справа от заголовка — слот `aside`: там стоит таймер сбора, чтобы срок был
 * виден не только на главной.
 *
 * Всё содержимое — слоты: состоянием фильтров и страницы владеет страница
 * в `apps/website` (оно живёт в query-параметрах), а шаблон отвечает только
 * за расположение.
 */
export const CatalogTemplate: FC<ICatalogTemplateProps & IBasicStyling> = ({
  title,
  summary,
  aside,
  search,
  filter,
  children,
  pagination,
  className,
}) => (
  <Container as="section" className={clsx(styles.container, className)}>
    <div className={styles.head}>
      <div className={styles.heading}>
        <Heading level={1}>{title}</Heading>
        {summary !== undefined && <Text tone="secondary">{summary}</Text>}
      </div>

      {aside !== undefined && <div className={styles.aside}>{aside}</div>}
    </div>

    {(search !== undefined || filter !== undefined) && (
      <div className={styles.controls}>
        {filter}
        {search}
      </div>
    )}

    {children}

    {pagination !== undefined && <div className={styles.pagination}>{pagination}</div>}
  </Container>
)
