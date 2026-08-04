import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { fieldError, fieldLabel, flexColumn, flexRow, focusRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

export const cells = style({
  ...flexRow(8),
  alignItems: 'center',
})

export const cell = style({
  width: rem(48),
  height: rem(56),
  textAlign: 'center',
  font: font('22/28', 600),
  color: color.text('primary'),
  backgroundColor: color.surface('base'),
  border: border(1, color.border('default')),
  borderRadius: vars.radius.sm,
  transition: transition('border-color', 'box-shadow'),
  selectors: {
    '&:focus-visible': {
      ...focusRing(),
      borderColor: color.border('focus'),
    },
    '&:disabled': {
      backgroundColor: color.surface('sunken'),
      cursor: 'not-allowed',
    },
  },
})

export const invalid = style({
  borderColor: color.danger('500'),
})

export const error = style(fieldError())
