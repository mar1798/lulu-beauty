import clsx from 'clsx'
import { type FC, type ReactNode } from 'react'
import type { IBasicStyling, IProduct, IProductPickerProps } from '../../types'
import { IconBox } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { Price } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { VisuallyHidden } from '../../atoms/visually-hidden'
import { primaryImage } from '../../molecules/product-card'
import { SearchField } from '../../molecules/search-field'
import * as styles from './ProductPicker.css'

/**
 * Поиск товара, чтобы добавить его в уже поданную заявку.
 *
 * Ищет бэкенд (`GET /products?q=`) — сам компонент по загруженному списку не
 * фильтрует и запросов не делает: и поиск, и добавление приходят обработчиками
 * из `apps/website`. Дебаунс тоже забота страницы, как у `SearchField`.
 *
 * Товар, который уже есть в заявке, не прячется: добавление сливается с
 * существующей строкой (там зафиксирована своя цена), и подпись кнопки говорит
 * об этом прямо, вместо того чтобы делать вид, что второй строки не будет.
 */

const IMAGE_SIZES = { fb: '48px' } as const

const SKELETON_ROWS = 2

/** Уже добавленный товар сольётся со своей строкой — подпись говорит об этом. */
const addLabel = (isAdded: boolean): string => (isAdded ? 'Ещё одну' : 'Добавить')

const ProductThumb: FC<{ product: IProduct }> = ({ product }) => {
  const image = primaryImage(product.images)

  return (
    <span className={styles.thumb}>
      {image === null ? (
        <span className={styles.placeholder}>
          <IconBox />
        </span>
      ) : (
        <AppImage
          image={{ src: image.url, alt: '' }}
          sizes={IMAGE_SIZES}
          fill={true}
        />
      )}
    </span>
  )
}

export const ProductPicker: FC<IProductPickerProps & IBasicStyling> = ({
  query,
  onQueryChange,
  products,
  isSearching = false,
  addedProductIds = [],
  onAdd,
  isBusy = false,
  error = null,
  label = 'Добавить товар',
  hint = 'Товар добавится в эту заявку по текущей цене каталога.',
  className,
}) => {
  const hasQuery = query.trim() !== ''

  const results = (): ReactNode => {
    /*
      Сбой поиска — не пустой ответ: сказать «ничего не нашлось» там, где
      запрос не дошёл, значит соврать про каталог.
    */
    if (error !== null) {
      return (
        <Text size="sm" tone="danger">
          {error}
        </Text>
      )
    }

    // Пустой запрос — не «ничего не нашлось»: искать ещё не начинали.
    if (!hasQuery) {
      return (
        <Text size="sm" tone="muted">
          {hint}
        </Text>
      )
    }

    /*
      Скелетон только на первом поиске: пока на экране есть прошлые результаты,
      подменять их полосками — значит мигать списком на каждую букву.
    */
    if (products === null) {
      return isSearching ? (
        <div className={styles.list} aria-busy={true}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className={styles.row}>
              <Skeleton shape="block" className={styles.skeletonThumb} />

              <div className={styles.skeletonLines}>
                <Skeleton width="60%" />
                <Skeleton width="25%" height={14} />
              </div>
            </div>
          ))}
        </div>
      ) : null
    }

    if (products.length === 0) {
      return (
        <Text size="sm" tone="muted">
          Ничего не нашлось. Попробуйте другое слово из названия.
        </Text>
      )
    }

    return (
      <div className={styles.list}>
        {products.map(product => {
          const isAdded = addedProductIds.includes(product.id)

          return (
            <div key={product.id} className={styles.row}>
              <ProductThumb product={product} />

              <div className={styles.body}>
                <Text size="sm" weight="medium" clamp={2}>
                  {product.name}
                </Text>

                <div className={styles.meta}>
                  <Price priceCents={product.priceCents} size="sm" />
                  {isAdded && <Badge tone="neutral">Уже в заявке</Badge>}
                </div>
              </div>

              <Button
                size="sm"
                variant="secondary"
                /*
                  Нет в наличии — не повод прятать строку: человек ищет по
                  названию и должен увидеть, что товар нашёлся, но недоступен.
                */
                disabled={isBusy || !product.inStock}
                onClick={() => {
                  onAdd(product.id)
                }}
              >
                {product.inStock ? (
                  /*
                    Кнопок в списке много, и вне своей строки «Добавить» ни о чём
                    не говорит: подпись для скринридера несёт и название. Видимая
                    при этом скрыта от него — иначе слово прозвучало бы дважды.
                  */
                  <>
                    <span aria-hidden={true}>{addLabel(isAdded)}</span>
                    <VisuallyHidden>{`${addLabel(isAdded)}: ${product.name}`}</VisuallyHidden>
                  </>
                ) : (
                  'Нет в наличии'
                )}
              </Button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={clsx(styles.container, className)}>
      <SearchField
        value={query}
        onChange={onQueryChange}
        label={label}
        placeholder="Название товара"
      />

      {results()}
    </div>
  )
}
