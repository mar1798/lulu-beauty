import { style } from '@vanilla-extract/css'
import { color, font, transition } from '../../styling/lib'
import { flexRow, focusVisibleRing, truncate } from '../../styling/mixin'

export const list = style({
  ...flexRow(8),
  alignItems: 'center',
  flexWrap: 'wrap',
  listStyle: 'none',
  margin: 0,
  padding: 0,
})

export const item = style({
  ...flexRow(8),
  alignItems: 'center',
  font: font('14/20'),
  color: color.text('muted'),
  minWidth: 0,
})

export const link = style([
  {
    color: color.text('secondary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const current = style({
  ...truncate(),
  maxWidth: '32ch',
  color: color.text('muted'),
})
