import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IGiftLineProps } from '../../types'
import { IconGift } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { Badge } from '../../atoms/badge'
import { Text } from '../../atoms/text'
import * as styles from './GiftLine.css'

/**
 * Подарок в корзине, на оформлении и в заявке: строка с картинкой, названием и
 * пометкой «Подарок» вместо цены.
 *
 * Это не позиция: подарка нет в `cart_items`, количество у него не правят и не
 * убирают, поэтому и управления в строке нет - только описание. Свободный
 * подарок (Mystery box) без картинки рисуется заглушкой-коробкой, чтобы строка
 * не выглядела пустой и не прыгала по высоте.
 */

const IMAGE_SIZES = { fb: '56px' } as const

export const GiftLine: FC<IGiftLineProps & IBasicStyling> = ({ gift, note, className }) => (
  <div className={clsx(styles.container, className)}>
    <span className={styles.thumb}>
      {gift.imageUrl === null ? (
        <span className={styles.placeholder}>
          <IconGift />
        </span>
      ) : (
        <AppImage image={{ src: gift.imageUrl, alt: '' }} sizes={IMAGE_SIZES} fill={true} />
      )}
    </span>

    <div className={styles.body}>
      <Badge tone="brand">Подарок</Badge>

      <Text weight="medium" clamp={2}>
        {gift.quantity > 1 ? `${gift.title} × ${gift.quantity}` : gift.title}
      </Text>

      {note !== undefined && (
        <Text size="sm" tone="muted">
          {note}
        </Text>
      )}
    </div>

    <Text as="span" weight="medium" tone="brand" className={styles.free}>
      Бесплатно
    </Text>
  </div>
)
