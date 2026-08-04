import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IOrderItemRowProps } from '../../types'
import { IconBox } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import * as styles from './OrderItemRow.css'

/**
 * Позиция заявки — снапшот на момент оформления, а не текущее состояние
 * каталога: ни количества, ни удаления здесь нет, менять поданную заявку
 * покупатель не может.
 *
 * Цена показывается та, что зафиксирована в заявке, даже если в каталоге она
 * с тех пор изменилась, — по ней и будет расчёт с владельцем.
 */

const IMAGE_SIZES = { fb: '64px' } as const

export const OrderItemRow: FC<IOrderItemRowProps & IBasicStyling> = ({
  item,
  href,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    <span className={styles.thumb}>
      {item.productImageUrl === null ? (
        <span className={styles.placeholder}>
          <IconBox />
        </span>
      ) : (
        <AppImage image={{ src: item.productImageUrl, alt: '' }} sizes={IMAGE_SIZES} fill={true} />
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

      <div className={styles.meta}>
        <Text size="sm" tone="muted">{`${item.quantity} шт ×`}</Text>
        <Price priceCents={item.productPriceCents} size="sm" />
      </div>
    </div>

    <div className={styles.total}>
      <Price priceCents={item.lineTotalCents} />
    </div>
  </div>
)
