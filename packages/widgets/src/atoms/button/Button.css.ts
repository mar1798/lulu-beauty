import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style([
  {
    ...flexRow(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: vars.radius.pill,
    border: border(1, 'transparent'),
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    transition: transition('background-color', 'color', 'border-color', 'box-shadow'),
    selectors: {
      '&[disabled], &[aria-disabled="true"]': {
        opacity: 0.55,
        cursor: 'not-allowed',
      },
    },
  },
  focusVisibleRing(),
])

export const fullWidth = style({
  width: '100%',
})

export const size = styleVariants({
  sm: { minHeight: rem(36), padding: `0 ${vars.space.md}`, font: font('14/20', 500) },
  md: { minHeight: rem(44), padding: `0 ${vars.space.lg}`, font: font('15/22', 500) },
  lg: { minHeight: rem(52), padding: `0 ${vars.space.xl}`, font: font('16/24', 600) },
})

export const variant = styleVariants({
  primary: {
    backgroundColor: color.brand('600'),
    color: color.text('inverse'),
    selectors: {
      '&:hover:not([disabled]):not([aria-disabled="true"])': {
        backgroundColor: color.brand('700'),
      },
      '&:active:not([disabled])': { backgroundColor: color.brand('800') },
    },
  },
  secondary: {
    backgroundColor: color.surface('base'),
    color: color.text('primary'),
    borderColor: color.border('default'),
    selectors: {
      '&:hover:not([disabled]):not([aria-disabled="true"])': {
        backgroundColor: color.surface('muted'),
        borderColor: color.border('strong'),
      },
    },
  },
  ghost: {
    backgroundColor: 'transparent',
    color: color.text('brand'),
    selectors: {
      '&:hover:not([disabled]):not([aria-disabled="true"])': {
        backgroundColor: color.brand('50'),
      },
    },
  },
  danger: {
    backgroundColor: color.danger('500'),
    color: color.text('inverse'),
    selectors: {
      '&:hover:not([disabled]):not([aria-disabled="true"])': {
        backgroundColor: color.danger('700'),
      },
    },
  },
})

/** Иконка наследует размер шрифта кнопки. */
export const icon = style({
  display: 'inline-flex',
  fontSize: '1.15em',
  flexShrink: 0,
})
