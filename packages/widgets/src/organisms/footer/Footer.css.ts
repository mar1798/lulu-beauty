import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing, gridAutoFit } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  marginTop: 'auto',
  backgroundColor: color.surface('muted'),
  borderTop: border(1, color.border('subtle')),
})

export const inner = style({
  ...flexColumn(32),
  paddingBlock: vars.space.xxl,
})

export const columns = style(gridAutoFit(200, 24))

export const column = style(flexColumn(10))

export const title = style({
  font: font('14/20', 600),
  color: color.text('primary'),
  textTransform: 'uppercase',
  letterSpacing: rem(0.5),
})

export const link = style([
  {
    font: font('14/22'),
    color: color.text('secondary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const bottom = style({
  ...flexColumn(8),
  paddingTop: vars.space.lg,
  borderTop: border(1, color.border('subtle')),
  ...media({
    md: {
      ...flexRow(16),
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  }),
})

export const note = style({
  font: font('13/20'),
  color: color.text('muted'),
})
