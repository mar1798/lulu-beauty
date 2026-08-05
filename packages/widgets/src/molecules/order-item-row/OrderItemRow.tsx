import clsx from 'clsx'
import { type FC, useState } from 'react'
import type { IBasicStyling, IOrderItemRowProps } from '../../types'
import { IconBox, IconClose } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { IconButton } from '../../atoms/icon-button'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { QuantityStepper } from '../quantity-stepper'
import * as styles from './OrderItemRow.css'

/**
 * Позиция заявки — снапшот на момент оформления, а не текущее состояние каталога.
 *
 * Цена показывается та, что зафиксирована в заявке, даже если в каталоге она
 * с тех пор изменилась, — по ней и будет расчёт с владельцем. Количество правится
 * по той же зафиксированной цене: правка состава не должна тихо переоценивать
 * заявку по текущему каталогу.
 *
 * Без обработчиков строка только читается — так она выглядит после закрытия
 * сбора, у отменённой заявки и у владельца в админке.
 */

const IMAGE_SIZES = { fb: '64px' } as const

export const OrderItemRow: FC<IOrderItemRowProps & IBasicStyling> = ({
  item,
  href,
  onQuantityChange,
  onRemove,
  canRemove = true,
  isBusy = false,
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

        {onQuantityChange === undefined ? (
          <div className={styles.meta}>
            <Text size="sm" tone="muted">{`${item.quantity} шт ×`}</Text>
            <Price priceCents={item.productPriceCents} size="sm" />
          </div>
        ) : (
          <>
            <Price priceCents={item.productPriceCents} size="sm" />

            <div className={styles.controls}>
              <QuantityStepper
                value={item.quantity}
                onChange={onQuantityChange}
                disabled={isBusy}
                label={`Количество: ${item.productName}`}
              />

              {onRemove !== undefined && (
                <IconButton
                  icon={<IconClose />}
                  label={
                    canRemove
                      ? `Убрать из заявки: ${item.productName}`
                      : 'Последнюю позицию убрать нельзя — отмените заявку целиком'
                  }
                  variant="ghost"
                  size="sm"
                  disabled={isBusy || !canRemove}
                  onClick={onRemove}
                />
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.total}>
        <Price priceCents={item.lineTotalCents} />
      </div>
    </div>
  )
}
