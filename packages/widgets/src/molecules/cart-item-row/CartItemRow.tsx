import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICartItemRowProps } from '../../types'
import { IconBox, IconClose } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { IconButton } from '../../atoms/icon-button'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { QuantityStepper } from '../quantity-stepper'
import * as styles from './CartItemRow.css'

/**
 * Позиция корзины.
 *
 * Адресуется `productId` — своего идентификатора у позиции нет
 * (`PATCH`/`DELETE /cart/items/{product_id}` на бэке). Цена за штуку и сумма
 * по строке приходят с сервера, фронт их не пересчитывает: так корзина
 * всегда сходится с тем, что увидит владелец в заявке.
 *
 * Без обработчиков строка только читается — так состав показан на оформлении,
 * где менять его нужно в корзине, а не под кнопкой отправки (см.
 * `CheckoutPanel`).
 */

const IMAGE_SIZES = { fb: '64px' } as const

export const CartItemRow: FC<ICartItemRowProps & IBasicStyling> = ({
  item,
  href,
  onQuantityChange,
  onRemove,
  isBusy = false,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    {/*
      Картинка не ссылка: рядом уже есть ссылка с названием, а второй
      переход на тот же товар только удлиняет обход с клавиатуры.
    */}
    <span className={styles.media64}>
      {item.productImageUrl === null ? (
        <span className={styles.placeholder}>
          <IconBox />
        </span>
      ) : (
        <AppImage
          image={{ src: item.productImageUrl, alt: '' }}
          sizes={IMAGE_SIZES}
          fill={true}
        />
      )}
    </span>

    <div className={styles.body}>
      <AppLink href={href} className={styles.name}>
        <Text weight="medium" clamp={2}>
          {item.productName}
        </Text>
      </AppLink>

      {onQuantityChange === undefined ? (
        <div className={styles.meta}>
          <Text size="sm" tone="muted">{`${item.quantity} шт ×`}</Text>
          <Price priceCents={item.productPriceCents} size="sm" />
        </div>
      ) : (
        <>
          <Price priceCents={item.productPriceCents} size="sm" />

          <div className={styles.controls}>
            {/*
              Количество на время своего же запроса не гаснет: значение меняется
              оптимистично, а запросы уходят по очереди — быстрые нажатия должны
              складываться (2 → 3 → 4), а не пропадать под курсором вместе с
              подсветкой кнопок.
            */}
            <QuantityStepper
              value={item.quantity}
              onChange={onQuantityChange}
              label={`Количество: ${item.productName}`}
            />

            {onRemove !== undefined && (
              <IconButton
                icon={<IconClose />}
                label={`Убрать из корзины: ${item.productName}`}
                variant="ghost"
                size="sm"
                disabled={isBusy}
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
