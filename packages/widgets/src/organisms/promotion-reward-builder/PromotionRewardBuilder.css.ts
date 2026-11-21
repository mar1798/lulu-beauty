import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Mobile first: награда — карточка в одну колонку, поля в две колонки с `sm`. */
export const container = style(flexColumn(12))

export const row = style({
  ...flexColumn(12),
  padding: vars.space.md,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
})

export const rowHead = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'space-between',
})

export const rowTitle = style({
  font: font('14/20', 600),
  color: color.text('primary'),
})

export const fields = style({
  ...flexColumn(12),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})

export const giftImage = style(flexColumn(8))

/** Превью подарка — квадрат: в корзине он стоит строкой с миниатюрой, а не баннером. */
export const giftPreview = style({
  position: 'relative',
  width: rem(120),
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  backgroundColor: color.surface('muted'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
})

export const giftPreviewImage = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

export const giftProduct = style(flexColumn(8))

export const promoCode = style(flexColumn(12))
