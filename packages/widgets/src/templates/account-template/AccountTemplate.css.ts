import { style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  paddingBlock: vars.space.xxl,
})

export const head = style(flexColumn(6))

export const body = style({
  ...flexColumn(24),
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: `${rem(200)} minmax(0, 1fr)`,
      gap: vars.space.xl,
      alignItems: 'start',
    },
  }),
})

/**
 * На узком экране разделы идут строкой над содержимым, на широком — колонкой
 * сбоку: двух пунктов мало, чтобы ради них жертвовать высотой на телефоне.
 */
export const nav = style({
  ...flexRow(16),
  flexWrap: 'wrap',
  ...media({
    md: {
      ...flexColumn(4),
      position: 'sticky',
      top: rem(96),
    },
  }),
})

export const navLink = style([
  {
    font: font('16/24', 500),
    color: color.text('secondary'),
    textDecoration: 'none',
    padding: `${rem(6)} ${vars.space.sm}`,
    borderRadius: vars.radius.pill,
    transition: transition('color', 'background-color'),
    selectors: {
      '&:hover': { color: color.text('primary') },
      /*
        Марочный 700, а не `text.brand` (600): на розовой подложке `surface.soft`
        шестисотый даёт 4.21:1 — ниже требуемых WCAG AA 4.5:1 (проверено axe).
      */
      '&[aria-current="page"]': {
        color: color.brand('700'),
        backgroundColor: color.surface('soft'),
      },
    },
  },
  focusVisibleRing(),
])

export const content = style({
  ...flexColumn(16),
  minWidth: 0,
})
