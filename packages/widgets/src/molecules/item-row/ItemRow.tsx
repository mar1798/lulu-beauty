import clsx from 'clsx'
import { type FC, useState } from 'react'
import type { IBasicStyling, IItemRowProps } from '../../types'
import { IconBox, IconClose } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { IconButton } from '../../atoms/icon-button'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { QuantityStepper } from '../quantity-stepper'
import { clampTag, productTags } from '../../utils/tags'
import * as styles from './ItemRow.css'

/**
 * Позиция списка — одна и та же в корзине, на оформлении и в заявке.
 *
 * Строка намеренно не знает, что за список её рисует: корзина и заявка
 * различаются не видом позиции, а тем, чем она адресуется и что означает
 * её цена. Поэтому здесь только `item` из общего `IItemRowItem`, а слова
 * «корзина»/«заявка» приходят подписями кнопки удаления.
 *
 * Цена показывается та, что дал сервер: в корзине — текущая каталожная, в
 * заявке — зафиксированная при оформлении, даже если в каталоге она с тех пор
 * изменилась. Пересчитывать строку на клиенте нельзя ни там, ни там.
 *
 * Без обработчиков строка только читается — так состав показан на оформлении,
 * у закрытой заявки и у владельца в админке.
 */

const IMAGE_SIZES = { fb: '64px' } as const

export const ItemRow: FC<IItemRowProps & IBasicStyling> = ({
  item,
  href,
  onQuantityChange,
  onRemove,
  canRemove = true,
  removeLabel,
  removeBlockedLabel = 'Последнюю позицию убрать нельзя — отмените заявку целиком',
  isBusy = false,
  isQuantityBusy = false,
  className,
}) => {
  /*
    Адрес картинки в заявке — снапшот на момент оформления, и он переживает
    сам файл: владелец волен удалить фотографию или весь товар. Поэтому
    «файл не отдался» здесь такое же штатное состояние, как «фотографии не
    было», и рисуется той же заглушкой, а не битой иконкой браузера.
  */
  const [isImageBroken, setIsImageBroken] = useState(false)
  const hasImage = item.productImageUrl !== null && !isImageBroken
  const tags = productTags({
    brand: item.productBrand,
    categoryName: item.productCategoryName,
    volumeMl: item.productVolumeMl,
  })

  return (
    <div className={clsx(styles.container, className)}>
      <span className={styles.thumb}>
        {hasImage ? (
          <AppImage
            image={{ src: item.productImageUrl ?? '', alt: '' }}
            sizes={IMAGE_SIZES}
            fill={true}
            onError={() => {
              setIsImageBroken(true)
            }}
          />
        ) : (
          <span className={styles.placeholder}>
            <IconBox />
          </span>
        )}
      </span>

      <div className={styles.body}>
        {/* Товар мог быть удалён из каталога — тогда название остаётся текстом. */}
        {href === null ? (
          <Text weight="medium" clamp={2}>
            {item.productName}
          </Text>
        ) : (
          <AppLink href={href} className={styles.name}>
            <Text weight="medium" clamp={2}>
              {item.productName}
            </Text>
          </AppLink>
        )}

        {/* Цена за штуку — часть описания позиции, поэтому остаётся у названия. */}
        {onQuantityChange === undefined ? (
          <div className={styles.meta}>
            <Text size="sm" tone="muted">{`${item.quantity} шт ×`}</Text>
            <Price priceCents={item.productPriceCents} size="sm" />
          </div>
        ) : (
          <Price priceCents={item.productPriceCents} size="sm" />
        )}

        {/*
          Метки под ценой — те же, что в карточке каталога (`productTags`), и по
          той же причине приглушены: они уточняют, что именно заказано, когда
          одно название этого не говорит («Toner» в трёх объёмах).
        */}
        {tags.length > 0 && (
          <span className={styles.tags}>
            {tags.map(tag => (
              <Text key={tag} className={styles.tag} as="span" size="xs" tone="muted">
                {clampTag(tag)}
              </Text>
            ))}
          </span>
        )}
      </div>

      <div className={styles.footer}>
        {onQuantityChange !== undefined && (
          <div className={styles.controls}>
            <QuantityStepper
              value={item.quantity}
              onChange={onQuantityChange}
              disabled={isQuantityBusy}
              label={`Количество: ${item.productName}`}
            />

            {onRemove !== undefined && (
              <IconButton
                icon={<IconClose />}
                label={
                  canRemove ? (removeLabel ?? `Убрать: ${item.productName}`) : removeBlockedLabel
                }
                variant="dangerSoft"
                size="sm"
                disabled={isBusy || !canRemove}
                onClick={onRemove}
              />
            )}
          </div>
        )}

        <div className={styles.total}>
          <Price priceCents={item.lineTotalCents} />
        </div>
      </div>
    </div>
  )
}
