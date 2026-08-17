import { style } from '@vanilla-extract/css'
import { border, color, media, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(12))

/**
 * Главный кадр — «карточка, которой и является картинка»: 28px и мягкая тень.
 *
 * На мобилке кадр 4:5 во всю ширину съедал первый экран целиком — цена и
 * кнопки уходили за сгиб. Ширина ограничена так, чтобы высота не превышала
 * ~40svh (`40svh * 4 / 5`), а сам кадр центрируется; с `md` — как было, во всю
 * колонку.
 */
export const main = style({
  position: 'relative',
  width: '100%',
  maxWidth: 'calc(40svh * 4 / 5)',
  alignSelf: 'center',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
  ...media({
    md: {
      maxWidth: 'none',
      alignSelf: 'stretch',
    },
  }),
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

/* Миниатюры идут под центрированным кадром, поэтому центрируются вместе с ним. */
export const thumbs = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  justifyContent: 'center',
  ...media({
    md: { justifyContent: 'flex-start' },
  }),
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
