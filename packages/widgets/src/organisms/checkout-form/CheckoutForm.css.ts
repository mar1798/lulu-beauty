import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const form = style({
  ...flexColumn(20),
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
})

export const totalRow = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
})
