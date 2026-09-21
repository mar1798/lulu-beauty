import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IProductDetailsProps } from '../../types'
import { Badge } from '../../atoms/badge'
import { Heading } from '../../atoms/heading'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { ProductGallery } from '../../molecules/product-gallery'
import { VariantSelector } from '../../molecules/variant-selector'
import { formatVolume } from '../../utils/volume'
import * as styles from './ProductDetails.css'

/**
 * Страница товара: галерея слева, описание справа.
 *
 * Кнопка «в корзину» приходит слотом `action`, «в избранное» —
 * `secondaryAction`: обе завязаны на активный цикл и авторизацию, а это
 * состояние `apps/website`, не виджета. Стоят они в одной строке, и вторая —
 * круглой иконкой: два подписанных действия делили строку пополам и читались
 * равными, хотя равными не являются.
 *
 * Товар, продающийся в нескольких объёмах, показывает переключатель, и цена с
 * наличием читаются уже с выбранного объёма, а не с товара: у товара
 * `priceCents` — это минимум («от»), а `inStock` — «хоть один объём есть», и
 * оба обещали бы не то, что покупатель сейчас положит в корзину. Строка с
 * ценой и меткой наличия — единственное место, где они названы: на самих
 * кнопках объёма их нет, и меняются они в ответ на выбор.
 * Описание выводится с `white-space: pre-line`: в импорте из xlsx переносы
 * строк осмысленные, и схлопывать их нельзя.
 */
export const ProductDetails: FC<IProductDetailsProps & IBasicStyling> = ({
  product,
  categoryName,
  selectedVariantId,
  onSelectVariant,
  action,
  secondaryAction,
  note,
  className,
}) => {
  /*
    Выбранный объём — источник цены и наличия. Товар с одним вариантом
    проходит через ту же ветку: у него выбирать нечего, но вариант есть
    всегда, и отдельного пути для «товара без объёмов» в коде не заводится.
  */
  const selected =
    product.variants.find(variant => variant.id === selectedVariantId) ??
    product.variants[0] ??
    null
  const hasChoice = product.variants.length > 1
  const priceCents = selected?.priceCents ?? product.priceCents
  const inStock = selected?.inStock ?? product.inStock
  // Метка объёма стоит рядом с маркой только тогда, когда он один: иначе объём
  // выбирают, и говорить о нём в справочной строке значит называть неверный.
  const volume = hasChoice ? null : formatVolume(selected?.volumeMl ?? product.volumeMl)

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
          <Price priceCents={priceCents} size="lg" />

          {inStock ? (
            <Badge tone="success" withDot={true}>
              В наличии
            </Badge>
          ) : (
            <Badge tone="neutral" withDot={true}>
              Нет в наличии
            </Badge>
          )}
        </div>

        {hasChoice && onSelectVariant !== undefined && (
          <VariantSelector
            className={styles.variants}
            variants={product.variants}
            selectedId={selected?.id ?? null}
            onSelect={onSelectVariant}
          />
        )}

        {product.description !== null && product.description !== '' && (
          <Text className={styles.description} tone="secondary">
            {product.description}
          </Text>
        )}

        {(action !== undefined || secondaryAction !== undefined) && (
          <div className={styles.action}>
            {/*
              Главное действие — подписанной кнопкой, «в избранное» — круглым
              сердцем рядом: слоты обёрнуты, потому что раскладка у них разная
              (одно тянется, второе держит квадрат), а классы слотам не передать.
            */}
            {action !== undefined && <div className={styles.actionPrimary}>{action}</div>}
            {secondaryAction !== undefined && (
              <div className={styles.actionSecondary}>{secondaryAction}</div>
            )}
          </div>
        )}

        {/*
          Объяснение под кнопками, а не вместо них: погашенная «в корзину»
          говорит, что нельзя, и ничего — почему.
        */}
        {note !== undefined && <div className={styles.note}>{note}</div>}
      </div>
    </div>
  )
}
