import { style } from '@vanilla-extract/css'
import { border, color, font, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Та же сетка, что в корзине: состав тянется, вторая колонка фиксирована. */
export const container = style({
  ...flexColumn(24),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 380px',
      gap: vars.space.xl,
      alignItems: 'start',
    },
  }),
})

export const items = style({
  ...flexColumn(12),
})

export const head = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

export const edit = style([
  {
    font: font('14/20'),
    color: color.text('secondary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const list = style({
  ...flexColumn(0),
  borderTop: border(1, color.border('subtle')),
})

/** Повторяет геометрию `CartItemRow`: миниатюра 64px и две строки текста. */
export const skeletonRow = style({
  ...flexRow(16),
  alignItems: 'flex-start',
  paddingBlock: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
})

export const skeletonThumb = style({
  flexShrink: 0,
  aspectRatio: '4 / 5',
})

export const skeletonLines = style({
  ...flexColumn(10),
  flex: 1,
  minWidth: 0,
})

/**
 * Форма прилипает к верху экрана на десктопе: состав может быть длинным, а
 * кнопка отправки должна оставаться под рукой без прокрутки обратно.
 */
export const form = style({
  ...media({
    lg: { position: 'sticky', top: vars.space.xxl },
  }),
})
