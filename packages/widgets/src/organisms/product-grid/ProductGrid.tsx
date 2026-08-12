import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IProductGridProps } from '../../types'
import { Appear } from '../../atoms/appear'
import { Skeleton } from '../../atoms/skeleton'
import { ProductCard } from '../../molecules/product-card'
import * as styles from './ProductGrid.css'

/**
 * Сетка каталога с тремя состояниями: загрузка, пусто, товары.
 *
 * Скелетоны повторяют пропорции карточки, поэтому при подмене на реальные
 * данные сетка не прыгает. Сама сетка — `auto-fill` без медиа-запросов:
 * число колонок определяет ширина контейнера, а не брейкпоинт.
 */

const DEFAULT_SKELETON_COUNT = 8

export const ProductGrid: FC<IProductGridProps & IBasicStyling> = ({
  products,
  buildHref,
  categoryNames,
  isLoading = false,
  skeletonCount = DEFAULT_SKELETON_COUNT,
  emptyState,
  renderAction,
  className,
}) => {
  if (isLoading) {
    return (
      <div className={clsx(styles.container, className)} aria-busy={true}>
        {Array.from({ length: skeletonCount }, (_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className={styles.skeletonCard}>
            <Skeleton className={styles.skeletonMedia} shape="block" tone="brand" />

            <div className={styles.skeletonBody}>
              <Skeleton width="80%" tone="brand" />
              <Skeleton width="50%" height={14} tone="brand" />
              <Skeleton width="40%" height={20} tone="brand" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return <>{emptyState}</>
  }

  /*
    Проявление играет один раз — когда сетка встаёт на место скелетона.

    Раньше ключом был состав страницы, и смена категории или страницы каталога
    пересоздавала узел: сетка уходила в нулевую прозрачность и проявлялась
    заново. При том, что прошлая страница остаётся на экране до ответа
    (`keepPreviousData`), это давало ровно то мигание, ради которого её и
    оставляют. Товары внутри различаются собственными ключами, поэтому
    подмена состава и без анимации не «слипается».
  */
  return (
    <Appear>
      <div className={clsx(styles.container, className)}>
        {products.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            href={buildHref(product)}
            categoryName={
              product.categoryId === null ? null : categoryNames?.[product.categoryId]
            }
            action={renderAction?.(product)}
          />
        ))}
      </div>
    </Appear>
  )
}
