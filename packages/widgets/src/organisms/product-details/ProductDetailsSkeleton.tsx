import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling } from '../../types'
import { Skeleton } from '../../atoms/skeleton'
import * as styles from './ProductDetails.css'

/** Сколько миниатюр рисовать под кадром: столько же, сколько у типичного товара. */
const THUMBS = 3

/**
 * Каркас страницы товара.
 *
 * Нужен там, где страница открывается раньше данных (`fallback: true` у
 * `/catalog/[slug]`): раскладка та же, что у `ProductDetails`, поэтому
 * подстановка товара не двигает содержимое.
 */
export const ProductDetailsSkeleton: FC<IBasicStyling> = ({ className }) => (
  <div className={clsx(styles.container, className)} aria-busy={true}>
    <div className={styles.skeletonGallery}>
      <Skeleton className={styles.skeletonMedia} shape="block" tone="brand" />

      <div className={styles.skeletonThumbs}>
        {Array.from({ length: THUMBS }, (_, index) => (
          <Skeleton key={index} className={styles.skeletonThumb} shape="block" tone="brand" />
        ))}
      </div>
    </div>

    <div className={styles.info}>
      <span className={styles.tags}>
        <Skeleton width={96} height={24} shape="block" tone="brand" />
      </span>

      <Skeleton width="70%" height={32} shape="block" tone="brand" />

      <div className={styles.priceRow}>
        <Skeleton width={120} height={28} shape="block" tone="brand" />
        <Skeleton width={104} height={24} shape="block" tone="brand" />
      </div>

      <Skeleton width="100%" tone="brand" />
      <Skeleton width="92%" tone="brand" />
      <Skeleton width="60%" tone="brand" />

      <div className={styles.action}>
        <Skeleton width={168} height={48} shape="block" tone="brand" />
        <Skeleton width={168} height={48} shape="block" tone="brand" />
      </div>
    </div>
  </div>
)
