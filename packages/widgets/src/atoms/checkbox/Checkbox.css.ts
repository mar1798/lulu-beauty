import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { fieldHint, flexRow, focusRing, visuallyHidden } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(10),
  alignItems: 'flex-start',
  cursor: 'pointer',
  selectors: {
    '&[data-disabled="true"]': { cursor: 'not-allowed', opacity: 0.6 },
  },
})

/** Нативный чекбокс скрыт, но остаётся фокусируемым и доступным. */
export const input = style(visuallyHidden())

export const box = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: rem(20),
  height: rem(20),
  marginTop: rem(1),
  fontSize: rem(14),
  color: 'transparent',
  backgroundColor: color.surface('base'),
  border: border(1, color.border('strong')),
  borderRadius: vars.radius.xs,
  transition: transition('background-color', 'border-color', 'color'),
  selectors: {
    [`${input}:checked + &`]: {
      backgroundColor: color.brand('600'),
      borderColor: color.brand('600'),
      color: color.text('inverse'),
    },
    [`${input}:focus-visible + &`]: focusRing(),
  },
})

export const body = style({
  display: 'block',
})

export const label = style({
  font: font('16/24'),
  color: color.text('primary'),
})

export const hint = style(fieldHint())
