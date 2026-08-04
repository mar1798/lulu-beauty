import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import {
  fieldError,
  fieldHint,
  fieldLabel,
  flexColumn,
  flexRow,
  truncate,
  visuallyHidden,
} from '../../styling/mixin'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

export const row = style({
  ...flexRow(12),
  alignItems: 'center',
})

/** Нативный `input[type=file]` спрятан: его вид не поддаётся стилизации. */
export const input = style(visuallyHidden())

export const fileName = style({
  ...truncate(),
  font: font('14/20'),
  color: color.text('secondary'),
  minWidth: 0,
})

export const hint = style(fieldHint())

export const error = style(fieldError())
