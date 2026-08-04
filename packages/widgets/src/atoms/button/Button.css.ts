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
  md: { minHeight: rem(44), padding: `0 ${vars.space.lg}`, font: font('16/24', 500) },
  lg: { minHeight: rem(52), padding: `0 ${vars.space.xl}`, font: font('17/26', 600) },
})

export const variant = styleVariants({
  /**
   * Единственная заливка акцентом в системе. Тень подкрашена той же маркой
   * (`shadow.brand`) — приём из референса: акцент читается и в подсветке.
   */
  primary: {
    backgroundColor: color.brand('600'),
    color: color.text('inverse'),
    boxShadow: vars.shadow.brand,
    selectors: {
      '&:hover:not([disabled]):not([aria-disabled="true"])': {
        backgroundColor: color.brand('700'),
      },
      '&:active:not([disabled])': { backgroundColor: color.brand('800') },
      '&[disabled], &[aria-disabled="true"]': { boxShadow: vars.shadow.none },
    },
  },
  secondary: {
    backgroundColor: color.surface('base'),
    color: color.text('primary'),
    borderColor: color.border('subtle'),
    boxShadow: vars.shadow.sm,
    selectors: {
      '&:hover:not([disabled]):not([aria-disabled="true"])': {
        borderColor: color.border('strong'),
        boxShadow: vars.shadow.lg,
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
