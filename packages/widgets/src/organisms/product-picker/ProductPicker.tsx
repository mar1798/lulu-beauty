import clsx from 'clsx'
import { type FC, type ReactNode } from 'react'
import type { IBasicStyling, IProduct, IProductPickerProps } from '../../types'
import { IconBox, IconPlus } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
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
 * существующей строкой (у неё своя цена), и подпись кнопки говорит об этом
 * прямо, вместо того чтобы делать вид, что второй строки не будет.
 */

const IMAGE_SIZES = { fb: '48px' } as const

/**
 * Строк в скелетоне. Три, а не две: столько результатов помещается в поле
 * зрения без прокрутки, и блок поиска реже меняет высоту, когда скелетон
 * сменяется выдачей.
 */
const SKELETON_ROWS = 3

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
        <AppImage image={{ src: image.url, alt: '' }} sizes={IMAGE_SIZES} fill={true} />
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
  addedLabel = 'Уже в заявке',
  onAdd,
  isBusy = false,
  error = null,
  label = 'Добавить товар',
  hint = 'Товар добавится в эту заявку по текущей цене каталога',
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
      Скелетон на любом поиске, а не только на первом, и раньше самого запроса:
      `isSearching` страница считает от набранного, а не от сетевого ответа
      (`useProductSearch`), поэтому полоски встают сразу после первой буквы и
      стоят весь дебаунс. Без этого блок на полсекунды оставался пустым —
      подсказка уже ушла, выдачи ещё нет, — и скелетон успевал мигнуть на
      считанные кадры, когда ответ уже в пути.
    */
    if (isSearching) {
      return (
        <div className={styles.list} aria-busy={true}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className={styles.row}>
              {/*
                Тон марки, как в скелетоне сетки каталога: розовый пульс на
                белой строке читается как ожидание, а не как серое полотно на
                месте выдачи.

                Ширина — пропом, а не классом: `Skeleton` кладёт её в инлайновый
                стиль, и `width` по умолчанию (100%) перебивал бы любой класс.
                Вместе с `aspect-ratio` это растягивало миниатюру во всю строку.
              */}
              <Skeleton shape="block" tone="brand" width={48} className={styles.skeletonThumb} />

              <div className={styles.skeletonLines}>
                <Skeleton width="65%" tone="brand" />
                <Skeleton width="30%" height={16} tone="brand" />
              </div>

              {/*
                Кнопка добавления держит за собой место в обеих формах — теми же
                подложками, что и настоящая, иначе строка на подмене менялась бы
                шириной текстовой части.
              */}
              <span className={styles.addCompact}>
                <Skeleton shape="circle" tone="brand" width={40} height={40} />
              </span>

              <span className={styles.addWide}>
                <Skeleton shape="block" tone="brand" width={96} height={36} />
              </span>
            </div>
          ))}
        </div>
      )
    }

    // Запрос есть, ответа ещё нет и поиск не идёт — рисовать нечего.
    if (products === null) {
      return null
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
                  {isAdded && <Badge tone="neutral">{addedLabel}</Badge>}
                </div>
              </div>

              {/*
                Одно и то же действие в двух формах: до `sm` — круглая кнопка с
                плюсом, как в карточке каталога (подписи там некуда встать,
                строка и так из миниатюры, названия и цены), дальше — кнопка со
                словом. Переключаются подложками, а не по ширине окна в JS:
                раскладка обязана быть верной уже в первом кадре.

                Нет в наличии — не повод прятать строку: человек ищет по
                названию и должен увидеть, что товар нашёлся, но недоступен.
              */}
              <span className={styles.addCompact}>
                <IconButton
                  icon={<IconPlus />}
                  label={
                    product.inStock
                      ? `${addLabel(isAdded)}: ${product.name}`
                      : `Нет в наличии: ${product.name}`
                  }
                  variant="primary"
                  size="md"
                  disabled={isBusy || !product.inStock}
                  onClick={() => {
                    onAdd(product.id)
                  }}
                />
              </span>

              <span className={styles.addWide}>
                <Button
                  size="sm"
                  /*
                    Акцентная, а не вторичная: добавление — единственное
                    действие в строке, и спорить ей тут не с чем.
                  */
                  variant="primary"
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
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={clsx(styles.container, className)}>
      {/*
        Спиннер на месте лупы — как в поиске каталога: занятость видна там, куда
        человек печатает, ещё до того как ниже встанет скелетон.
      */}
      <SearchField
        value={query}
        onChange={onQueryChange}
        label={label}
        placeholder="Название товара"
        isBusy={isSearching}
      />

      {results()}
    </div>
  )
}
