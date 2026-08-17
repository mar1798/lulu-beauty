import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IProductDetailsProps } from '../../types'
import { Badge } from '../../atoms/badge'
import { Heading } from '../../atoms/heading'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { ProductGallery } from '../../molecules/product-gallery'
import { formatVolume } from '../../utils/volume'
import * as styles from './ProductDetails.css'

/**
 * Страница товара: галерея слева, описание справа.
 *
 * Кнопка «в корзину» приходит слотом `action`, «в избранное» —
 * `secondaryAction`: обе завязаны на активный цикл и авторизацию, а это
 * состояние `apps/website`, не виджета.
 * Описание выводится с `white-space: pre-line`: в импорте из xlsx переносы
 * строк осмысленные, и схлопывать их нельзя.
 */
export const ProductDetails: FC<IProductDetailsProps & IBasicStyling> = ({
  product,
  categoryName,
  action,
  secondaryAction,
  className,
}) => {
  const volume = formatVolume(product.volumeMl)

  return (
    <div className={clsx(styles.container, className)}>
      <ProductGallery images={product.images} productName={product.name} />

      <div className={styles.info}>
        {(product.brand !== null ||
          (categoryName !== undefined && categoryName !== null) ||
          volume !== null) && (
          <span className={styles.tags}>
            {/*
              Тон марки, а не нейтральный: справочные метки — единственный
              цветной акцент над заголовком, и в сером они читались как
              служебная подпись, а не как часть карточки товара.
            */}
            {product.brand !== null && <Badge tone="brand">{product.brand}</Badge>}
            {categoryName !== undefined && categoryName !== null && (
              <Badge tone="brand">{categoryName}</Badge>
            )}
            {/* Объём — такая же справочная метка, как марка и категория, и стоит с ними. */}
            {volume !== null && <Badge tone="brand">{volume}</Badge>}
          </span>
        )}

        <Heading level={1} size="lg">
          {product.name}
        </Heading>

        <div className={styles.priceRow}>
          <Price priceCents={product.priceCents} size="lg" />

          {product.inStock ? (
            <Badge tone="success" withDot={true}>
              В наличии
            </Badge>
          ) : (
            <Badge tone="neutral" withDot={true}>
              Нет в наличии
            </Badge>
          )}
        </div>

        {product.description !== null && product.description !== '' && (
          <Text className={styles.description} tone="secondary">
            {product.description}
          </Text>
        )}

        {(action !== undefined || secondaryAction !== undefined) && (
          <div className={styles.action}>
            {/* Оба действия — подписанными кнопками в одной строке, вторым «в избранное». */}
            {action}
            {secondaryAction}
          </div>
        )}
      </div>
    </div>
  )
}
