import { style } from '@vanilla-extract/css'
import { color } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(16),
  padding: vars.space.xl,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
})

export const head = style({
  ...flexRow(16),
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

export const headMain = style({
  ...flexColumn(4),
})

export const note = style({
  ...flexColumn(4),
  padding: vars.space.md,
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.xl,
})

export const items = style({
  ...flexColumn(0),
})

export const totalRow = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
})
