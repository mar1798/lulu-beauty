import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const form = style({
  ...flexColumn(16),
  alignItems: 'stretch',
})

export const submit = style({
  marginTop: vars.space.xs,
  alignSelf: 'flex-start',
})

export const footer = style({
  ...flexColumn(12),
  /* Кнопка выхода не должна растягиваться на всю ширину формы. */
  alignItems: 'flex-start',
  paddingTop: vars.space.md,
  borderTop: border(1, color.border('subtle')),
})
