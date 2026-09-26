import clsx from 'clsx'
import { type FC, useEffect, useRef } from 'react'
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
  focusKey,
  aside,
  search,
  filter,
  children,
  pagination,
  className,
}) => {
  const headingRef = useRef<HTMLDivElement>(null)
  const previousKey = useRef(focusKey)

  useEffect(() => {
    if (previousKey.current === focusKey) {
      return
    }

    previousKey.current = focusKey
    // Без прокрутки: страница сама плавно едет к началу, рывок фокуса её перебил бы.
    headingRef.current?.focus({ preventScroll: true })
  }, [focusKey])

  return (
    <Container as="section" className={clsx(styles.container, className)}>
      <div className={styles.head}>
        <div ref={headingRef} className={styles.heading} tabIndex={-1}>
          <Heading level={1}>{title}</Heading>
          {/*
            Живая область стоит всегда, даже пустая: скринридер следит только за
            областями, которые были в документе до изменения.
          */}
          <div role="status">
            {summary !== undefined && <Text tone="secondary">{summary}</Text>}
          </div>
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
}
