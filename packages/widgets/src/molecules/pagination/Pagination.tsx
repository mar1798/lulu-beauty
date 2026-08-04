import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IPaginationProps } from '../../types'
import { IconChevronLeft, IconChevronRight } from '../../svg/icons'
import * as styles from './Pagination.css'

/**
 * Пагинация под конверт `IPage<T>` — считает число страниц из `total`
 * и `pageSize`, которые отдаёт бэкенд.
 */

/** Многоточие вместо номера. */
export const PAGE_GAP = 'gap'

/** Сколько соседей текущей страницы показываем с каждой стороны. */
const SIBLINGS = 1

export type IPageItem = number | typeof PAGE_GAP

export const pageCountOf = (total: number, pageSize: number): number =>
  pageSize <= 0 ? 0 : Math.ceil(total / pageSize)

/**
 * Номера страниц с многоточиями: первая и последняя видны всегда, вокруг
 * текущей — по соседу. Список длиннее семи элементов не разрастается,
 * иначе на телефоне пагинация уезжает в две строки.
 */
export const pageItems = (page: number, pageCount: number): IPageItem[] => {
  if (pageCount <= 1) {
    return []
  }

  const items: IPageItem[] = []
  const from = Math.max(2, page - SIBLINGS)
  const to = Math.min(pageCount - 1, page + SIBLINGS)

  items.push(1)

  if (from > 2) {
    items.push(PAGE_GAP)
  }

  for (let current = from; current <= to; current += 1) {
    items.push(current)
  }

  if (to < pageCount - 1) {
    items.push(PAGE_GAP)
  }

  items.push(pageCount)

  return items
}

export const Pagination: FC<IPaginationProps & IBasicStyling> = ({
  page,
  pageSize,
  total,
  onChange,
  className,
}) => {
  const pageCount = pageCountOf(total, pageSize)
  const items = pageItems(page, pageCount)

  // Одна страница (или ни одной) — показывать нечего.
  if (items.length === 0) {
    return null
  }

  return (
    <nav className={clsx(styles.container, className)} aria-label="Страницы каталога">
      <button
        type="button"
        className={clsx(styles.page, styles.arrow)}
        disabled={page <= 1}
        aria-label="Предыдущая страница"
        onClick={() => onChange(page - 1)}
      >
        <IconChevronLeft />
      </button>

      {items.map((item, index) =>
        item === PAGE_GAP ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`gap-${index}`} className={styles.gap} aria-hidden={true}>
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={styles.page}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Страница ${item}`}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        className={clsx(styles.page, styles.arrow)}
        disabled={page >= pageCount}
        aria-label="Следующая страница"
        onClick={() => onChange(page + 1)}
      >
        <IconChevronRight />
      </button>
    </nav>
  )
}
