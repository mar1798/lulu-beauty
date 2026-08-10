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

/**
 * Список товаров и фильтр по категориям: от `lg` — сетка с таблицей слева и
 * категориями в узкой колонке справа (`gridTemplateAreas` вместо порядка в
 * DOM — на мобильном фильтр остаётся выше таблицы, где он и должен быть).
 * До `lg` — просто колонка, категории рендерятся как обычно, над таблицей.
 */
export const productsLayout = style({
  ...flexColumn(20),
  width: '100%',
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: `minmax(0, 1fr) ${rem(240)}`,
      gridTemplateAreas: '"main aside"',
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

export const productsMain = style({
  ...flexColumn(16),
  minWidth: 0,
  ...media({ lg: { gridArea: 'main' } }),
})

export const categorySidebar = style({
  ...flexColumn(12),
  width: '100%',
  ...media({
    lg: {
      gridArea: 'aside',
      padding: vars.space.md,
      backgroundColor: color.surface('base'),
      borderRadius: vars.radius.xxl,
      boxShadow: vars.shadow.md,
      position: 'sticky',
      top: rem(96),
    },
  }),
})

/**
 * На мобильном свой лейбл уже есть у `<Select>` внутри `CategoryFilter` —
 * этот заголовок продублировал бы его, поэтому виден только рядом с сеткой
 * чипов на `lg`.
 */
export const categorySidebarTitle = style({
  display: 'none',
  ...media({
    lg: {
      display: 'block',
      font: font('13/18', 600),
      color: color.text('muted'),
      textTransform: 'uppercase',
      letterSpacing: vars.tracking.wide,
    },
  }),
})

export const stack = style(flexColumn(16))

export const row = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})
