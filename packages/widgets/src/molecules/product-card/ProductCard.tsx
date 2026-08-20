import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IProductCardProps, IProductImage } from '../../types'
import { IconBox } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { clampTag, productTags } from '../../utils/tags'
import * as styles from './ProductCard.css'

/**
 * Карточка товара в сетке каталога: единый белый блок, внутри которого сверху
 * лежит фотография на утопленной подложке, ниже — название, приглушённая
 * подпись (марка · категория) и строка «цена + круглое действие».
 *
 * Кнопка «в корзину» приходит слотом `action`: класть её внутрь ссылки нельзя
 * (интерактив внутри интерактива), а знать про корзину карточке незачем —
 * состояние живёт в `apps/website`.
 */

/** Главная картинка — помеченная `isPrimary`, иначе первая по порядку. */
export const primaryImage = (images: IProductImage[]): IProductImage | null =>
  images.find(image => image.isPrimary) ?? images[0] ?? null

/**
 * Держать синхронным с `ProductGrid.css.ts`: сетка переходит на четыре колонки уже
 * на `md`, а `sizes` обещал браузеру половину вьюпорта вплоть до `lg`. На 900px
 * карточка занимает ~197px при заявленных 450 — при DPR 2 браузер брал кандидата
 * 1080 вместо 640, то есть втрое больше пикселей, чем нужно.
 */
const DEFAULT_SIZES = { fb: '50vw', sm: '50vw', md: '25vw', lg: '25vw' } as const

export const ProductCard: FC<IProductCardProps & IBasicStyling> = ({
  product,
  href,
  categoryName,
  sizes = DEFAULT_SIZES,
  action,
  mediaAction,
  className,
}) => {
  const image = primaryImage(product.images)
  /* Марка, категория и объём — приглушённые метки под названием (см. `productTags`). */
  const tags = productTags({ brand: product.brand, categoryName, volumeMl: product.volumeMl })

  return (
    <article className={clsx(styles.container, className)}>
      <span className={styles.media}>
        {image === null ? (
          <span className={styles.placeholder}>
            <IconBox />
          </span>
        ) : (
          <AppImage
            className={styles.image}
            image={{ src: image.url, alt: image.alt ?? product.name }}
            sizes={sizes}
            fill={true}
          />
        )}

        {!product.inStock && (
          <Badge className={styles.stockBadge} tone="neutral">
            Нет в наличии
          </Badge>
        )}
      </span>

      {/*
        Сердце лежит рядом с `media`, а не внутри него: у `media` включён
        `overflow: hidden` ради скругления фотографии, и подсказка над кнопкой
        обрезалась бы по её краю.
      */}
      {mediaAction !== undefined && mediaAction !== null && (
        <span className={styles.mediaAction}>{mediaAction}</span>
      )}

      <div className={styles.body}>
        <AppLink href={href} className={styles.link}>
          <Text as="span" size="sm" weight="semibold" clamp={2}>
            {product.name}
          </Text>

          {tags.length > 0 && (
            <span className={styles.tags}>
              {tags.map(tag => (
                <Text key={tag} className={styles.tag} as="span" size="xs" tone="muted">
                  {clampTag(tag)}
                </Text>
              ))}
            </span>
          )}
        </AppLink>

        <div className={styles.footer}>
          <Price size="md" priceCents={product.priceCents} />
          {action !== undefined && action !== null && <span className={styles.action}>{action}</span>}
        </div>
      </div>
    </article>
  )
}
