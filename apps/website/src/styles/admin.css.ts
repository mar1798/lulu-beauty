import { style } from '@vanilla-extract/css'
import { color, font, media, rem } from 'widgets/styling/lib'
import { flexColumn, flexRow, panel as panelMixin } from 'widgets/styling/mixin'
import { vars } from 'widgets/styling/theme'

/**
 * Общие блоки страниц админки: панель-карточка, ряды фильтров и счётчиков.
 * Живут в приложении, а не в `widgets`, — это композиция конкретных экранов,
 * а не переиспользуемый компонент.
 */

export const panel = style({
  ...flexColumn(12),
  alignItems: 'flex-start',
  ...panelMixin(),
})

/**
 * Экран ожидания гейта: пока не ясно, владелец ли пришёл, вместо разделов
 * админки висит только спиннер. Высота задана, чтобы подвал не подпрыгивал
 * к шапке на пустой странице.
 */
export const gate = style({
  ...flexColumn(0),
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: rem(320),
  color: color.text('subtle'),
})

export const cycleHead = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

/**
 * Счётчики заявок. На телефоне это две колонки: подписи вроде «Ожидает
 * подтверждения» в 120px не помещаются в строку, а при трёх колонках из пяти
 * счётчиков получалась рваная лесенка.
 */
export const counters = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: vars.space.md,
  width: '100%',
  ...media({
    sm: { gridTemplateColumns: `repeat(auto-fit, minmax(${rem(120)}, 1fr))` },
  }),
})

export const counter = style(flexColumn(2))

export const counterValue = style({
  font: font('24/30', 600),
  letterSpacing: vars.tracking.display,
  color: color.text('primary'),
  fontVariantNumeric: 'tabular-nums',
  ...media({
    sm: { font: font('28/34', 600) },
  }),
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
 * На мобильном свой лейбл уже есть у `<Select>` внутри `CategoryFilter` —
 * этот заголовок продублировал бы его, поэтому появляется вместе с сеткой
 * чипов, то есть от `sm`.
 */
export const categorySidebarTitle = style({
  display: 'none',
  ...media({
    sm: {
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
