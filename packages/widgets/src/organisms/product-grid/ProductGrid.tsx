import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IProductGridProps } from '../../types'
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
            <Skeleton className={styles.skeletonMedia} shape="block" />
            <Skeleton width="80%" />
            <Skeleton width="40%" height={18} />
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className={clsx(styles.container, className)}>
      {products.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          href={buildHref(product)}
          action={renderAction?.(product)}
        />
      ))}
    </div>
  )
}
