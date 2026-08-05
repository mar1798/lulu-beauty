import { style } from '@vanilla-extract/css'
import { color, font, media, rem } from 'widgets/styling/lib'
import { flexColumn, flexRow } from 'widgets/styling/mixin'
import { vars } from 'widgets/styling/theme'

/**
 * Общие блоки страниц админки: панель-карточка, ряды фильтров и счётчиков.
 * Живут в приложении, а не в `widgets`, — это композиция конкретных экранов,
 * а не переиспользуемый компонент.
 */

export const panel = style({
  ...flexColumn(12),
  alignItems: 'flex-start',
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
})

export const cycleHead = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

export const counters = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${rem(120)}, 1fr))`,
  gap: vars.space.md,
  width: '100%',
})

export const counter = style(flexColumn(2))

export const counterValue = style({
  font: font('28/34', 600),
  letterSpacing: vars.tracking.display,
  color: color.text('primary'),
  fontVariantNumeric: 'tabular-nums',
})

export const counterLabel = style({
  font: font('13/18'),
  color: color.text('muted'),
})

/** Полоса фильтров над таблицей: на узком экране складывается в колонку. */
export const filters = style({
  ...flexColumn(12),
  width: '100%',
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto',
      gap: vars.space.md,
      alignItems: 'end',
    },
  }),
})

export const filtersWide = style({
  ...flexColumn(12),
  width: '100%',
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
      gap: vars.space.md,
      alignItems: 'end',
    },
  }),
})

export const stack = style(flexColumn(16))

export const row = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})
