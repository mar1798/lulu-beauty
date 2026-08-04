import { style } from '@vanilla-extract/css'
import { border, color, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(12))

/** Главный кадр — «карточка, которой и является картинка»: 28px и мягкая тень. */
export const main = style({
  position: 'relative',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
})

export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: vars.space.xxxl,
  color: color.text('subtle'),
})

export const thumbs = style({
  ...flexRow(8),
  flexWrap: 'wrap',
})

export const thumb = style([
  {
    position: 'relative',
    width: rem(72),
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    padding: 0,
    backgroundColor: color.surface('sunken'),
    border: border(2, 'transparent'),
    borderRadius: vars.radius.lg,
    cursor: 'pointer',
    transition: transition('border-color'),
    selectors: {
      '&:hover': { borderColor: color.border('default') },
      '&[aria-current="true"]': { borderColor: color.brand('600') },
    },
  },
  focusVisibleRing(),
])
