import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, rem, transition } from '../../styling/lib'
import { focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: vars.radius.circle,
    border: border(1, 'transparent'),
    cursor: 'pointer',
    transition: transition('background-color', 'color', 'border-color', 'box-shadow'),
    selectors: {
      '&[disabled]': { opacity: 0.55, cursor: 'not-allowed' },
    },
  },
  focusVisibleRing(),
])

export const size = styleVariants({
  sm: { width: rem(32), height: rem(32), fontSize: rem(16) },
  md: { width: rem(40), height: rem(40), fontSize: rem(20) },
  lg: { width: rem(48), height: rem(48), fontSize: rem(24) },
})

export const variant = styleVariants({
  ghost: {
    backgroundColor: 'transparent',
    color: color.text('secondary'),
    selectors: {
      '&:hover:not([disabled])': {
        backgroundColor: color.surface('sunken'),
        color: color.text('primary'),
      },
    },
  },
  solid: {
    backgroundColor: color.surface('base'),
    color: color.text('primary'),
    borderColor: color.border('default'),
    selectors: {
      '&:hover:not([disabled])': { backgroundColor: color.surface('muted') },
    },
  },
  danger: {
    backgroundColor: 'transparent',
    color: color.text('danger'),
    selectors: {
      '&:hover:not([disabled])': { backgroundColor: color.danger('100') },
    },
  },
})
