import { style } from '@vanilla-extract/css'
import { flexRow } from '../../styling/mixin'

export const container = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})
