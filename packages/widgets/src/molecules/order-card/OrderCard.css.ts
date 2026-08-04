import { style } from '@vanilla-extract/css'
import { color, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style([
  {
    ...flexColumn(8),
    padding: vars.space.lg,
    backgroundColor: color.surface('base'),
    borderRadius: vars.radius.xxl,
    boxShadow: vars.shadow.md,
    color: color.text('primary'),
    textDecoration: 'none',
    transition: transition('box-shadow'),

    selectors: {
      '&:hover': {
        boxShadow: vars.shadow.lg,
      },
    },
  },
  focusVisibleRing(),
])

export const head = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

export const foot = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginTop: vars.space.xs,
})
