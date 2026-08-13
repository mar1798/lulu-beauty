import { style } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, panel } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(20),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

export const form = style({
  ...flexColumn(16),
  ...panel(),
})

/** Цена и категория — короткие поля, на широком экране им незачем занимать строку каждому. */
export const row = style({
  ...flexColumn(16),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})

export const formActions = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingTop: vars.space.xs,
})

/** Панель фотографий; имя не `media` — оно занято хелпером медиазапросов. */
export const mediaPanel = style({
  ...flexColumn(16),
  ...panel(),
})

export const gallery = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${rem(96)}, 1fr))`,
  gap: vars.space.sm,
  listStyle: 'none',
  ...media({
    sm: { gridTemplateColumns: `repeat(auto-fill, minmax(${rem(120)}, 1fr))` },
  }),
})

export const thumb = style({
  position: 'relative',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.lg,
})

export const thumbImage = style({
  objectFit: 'cover',
})

export const thumbDelete = style({
  position: 'absolute',
  insetInlineEnd: vars.space.xxs,
  insetBlockEnd: vars.space.xxs,
  backgroundColor: color.surface('base'),
})
