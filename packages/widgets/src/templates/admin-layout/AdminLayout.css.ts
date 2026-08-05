import { style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  paddingBlock: vars.space.xl,
})

export const body = style({
  ...flexColumn(24),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: `${rem(220)} minmax(0, 1fr)`,
      gap: vars.space.xl,
      alignItems: 'start',
    },
  }),
})

/**
 * На узком экране разделы идут строкой с горизонтальной прокруткой: их семь,
 * и колонка на телефоне съела бы экран целиком ещё до содержимого.
 */
export const nav = style({
  ...flexRow(8),
  overflowX: 'auto',
  paddingBottom: vars.space.xxs,
  ...media({
    lg: {
      ...flexColumn(4),
      overflowX: 'visible',
      position: 'sticky',
      top: rem(96),
    },
  }),
})

export const navLink = style([
  {
    ...flexRow(8),
    alignItems: 'center',
    flexShrink: 0,
    font: font('15/22', 500),
    color: color.text('secondary'),
    textDecoration: 'none',
    padding: `${rem(8)} ${vars.space.sm}`,
    borderRadius: vars.radius.pill,
    whiteSpace: 'nowrap',
    transition: transition('color', 'background-color'),
    selectors: {
      '&:hover': { color: color.text('primary'), backgroundColor: color.surface('muted') },
      /* Марочный 700 — на розовой подложке 600 не добирает до WCAG AA (как в AccountTemplate). */
      '&[aria-current="page"]': {
        color: color.brand('700'),
        backgroundColor: color.surface('soft'),
      },
    },
  },
  focusVisibleRing(),
])

export const navIcon = style({
  display: 'inline-flex',
  fontSize: rem(18),
  color: 'currentColor',
})

export const content = style({
  ...flexColumn(20),
  minWidth: 0,
})

export const head = style({
  ...flexColumn(12),
  ...media({
    sm: {
      ...flexRow(16),
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    },
  }),
})

export const headText = style(flexColumn(4))

export const actions = style({
  ...flexRow(8),
  flexWrap: 'wrap',
})
