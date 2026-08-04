import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(6),
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
})

export const page = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(40),
    height: rem(40),
    padding: `0 ${rem(10)}`,
    font: font('14/20', 500),
    color: color.text('secondary'),
    backgroundColor: 'transparent',
    border: border(1, 'transparent'),
    borderRadius: vars.radius.pill,
    cursor: 'pointer',
    transition: transition('background-color', 'color', 'border-color'),
    selectors: {
      '&:hover:not([disabled])': { backgroundColor: color.surface('sunken') },
      '&[disabled]': { opacity: 0.4, cursor: 'not-allowed' },
      '&[aria-current="page"]': {
        backgroundColor: color.brand('600'),
        borderColor: color.brand('600'),
        color: color.text('inverse'),
      },
    },
  },
  focusVisibleRing(),
])

export const arrow = style({
  fontSize: rem(18),
})

/** Многоточие — не кнопка: жать не на что. */
export const gap = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: rem(28),
  height: rem(40),
  font: font('14/20'),
  color: color.text('muted'),
})
