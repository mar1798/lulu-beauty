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
            <Skeleton width="80%" tone="brand" />
            <Skeleton width="40%" height={18} tone="brand" />
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return <>{emptyState}</>
  }

  /*
    Ключ появления — состав страницы: подмена скелетона товарами и переход на
    другую страницу каталога проигрывают проявление, а перерисовка от кнопки
    «в корзину» — нет. Иначе сетка мигала бы на каждое действие.
  */
  return (
    <Appear appearKey={products.map(product => product.id).join()}>
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
    </Appear>
  )
}
