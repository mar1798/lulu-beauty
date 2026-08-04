import { style } from '@vanilla-extract/css'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const form = style(flexColumn(16))

export const submit = style({
  marginTop: vars.space.xs,
})
