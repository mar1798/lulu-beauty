import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { flexColumn, visuallyHidden } from '../../styling/mixin'
import { fieldError, fieldHint, fieldLabel } from '../../styling/mixin/field'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

export const zone = style({
  ...flexColumn(8),
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: vars.space.xl,
  backgroundColor: color.surface('muted'),
  /* Пунктир — единственное место в системе: он и означает «сюда можно бросить». */
  border: `${rem(2)} dashed ${color.border('default')}`,
  borderRadius: vars.radius.xxl,
  transition: transition('border-color', 'background-color'),
})

export const zoneOver = style({
  borderColor: color.border('focus'),
  backgroundColor: color.surface('soft'),
})

export const zoneInvalid = style({
  borderColor: color.danger('500'),
})

export const zoneDisabled = style({
  opacity: 0.6,
  cursor: 'not-allowed',
})

export const icon = style({
  fontSize: rem(28),
  color: color.text('muted'),
})

export const prompt = style({
  font: font('14/20'),
  color: color.text('secondary'),
  maxWidth: rem(320),
})

export const input = style(visuallyHidden())

export const hint = style(fieldHint())

export const error = style(fieldError())
