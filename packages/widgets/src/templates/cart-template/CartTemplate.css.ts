import { style } from '@vanilla-extract/css'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  paddingBlock: vars.space.xl,
})

export const head = style(flexColumn(6))
