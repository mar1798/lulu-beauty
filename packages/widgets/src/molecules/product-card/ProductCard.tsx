import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IProductCardProps, IProductImage } from '../../types'
import { IconBox } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { formatVolume } from '../../utils/volume'
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

const DEFAULT_SIZES = { fb: '50vw', sm: '50vw', lg: '25vw' } as const

/**
 * Потолок длины метки под названием.
 *
 * Обрезка по символам, а не по ширине: метки стоят в одной строке, и та, что
 * длиннее остальных вместе взятых (случается у категорий из импорта), иначе
 * вытеснила бы их на вторую строку целиком. Значение подобрано под самую
 * узкую колонку сетки — две карточки в ряд на телефоне.
 */
const TAG_MAX_CHARS = 18

const clampTag = (value: string): string =>
  value.length > TAG_MAX_CHARS ? `${value.slice(0, TAG_MAX_CHARS - 1).trimEnd()}…` : value

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
  const brand = product.brand !== null && product.brand.trim() !== '' ? product.brand : null
  const category =
    categoryName !== undefined && categoryName !== null && categoryName.trim() !== ''
      ? categoryName
      : null
  /*
    Марка, категория и объём — приглушённые метки под названием. Каждая своим
    элементом, а не одной склеенной строкой: склеенная обрезалась целиком по
    ширине колонки, и от «Round lab · Cleanser · 1000 мл» на телефоне
    оставалось «Round lab · Clea…» — категория и объём пропадали вместе.
    Теперь длинная метка укорачивается сама (`clampTag`), а не съедает соседние,
    и метки переносятся на вторую строку.

    Объём последним — он уточняет товар, а не называет его.
  */
  const tags = [brand, category, formatVolume(product.volumeMl)].filter(
    (value): value is string => value !== null
  )

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
                <Text key={tag} as="span" size="xs" tone="muted">
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
