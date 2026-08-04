import { style } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  alignItems: 'center',
  textAlign: 'center',
  padding: `${vars.space.xxl} ${vars.space.md}`,
})

export const icon = style({
  fontSize: rem(40),
  color: color.text('subtle'),
})

export const action = style({
  marginTop: vars.space.xs,
})
