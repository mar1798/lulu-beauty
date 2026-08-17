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

/**
 * Цена, объём, категория и производитель — короткие поля, на широком экране им
 * незачем занимать строку каждому: встают парами по две колонки.
 */
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

/**
 * Панель фотографий; имя не `media` — оно занято хелпером медиазапросов.
 *
 * В одну колонку (до `lg`) стоит **над** формой: заводя товар, владелец
 * начинает со снимка, а под формой на полтора экрана вниз панель просто не
 * попадалась на глаза. Порядком, а не перестановкой в разметке: с `lg`
 * container — сетка, и там панель обязана остаться в правой колонке, то есть
 * второй по документу.
 */
export const mediaPanel = style({
  ...flexColumn(16),
  ...panel(),
  order: -1,
  ...media({
    lg: { order: 0 },
  }),
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
  // Фотография товара нигде не обрезается — см. `AppImage`/`components/Image.tsx`.
  objectFit: 'contain',
})

export const thumbDelete = style({
  position: 'absolute',
  insetInlineEnd: vars.space.xxs,
  insetBlockEnd: vars.space.xxs,
  backgroundColor: color.surface('base'),
})
