import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  position: 'sticky',
  top: 0,
  zIndex: vars.zIndex.header,
  backgroundColor: color.surface('base', 0.92),
  backdropFilter: 'blur(12px)',
  borderBottom: border(1, color.border('subtle')),
})

export const inner = style({
  ...flexRow(16),
  alignItems: 'center',
  minHeight: rem(72),
})

export const logo = style([
  {
    font: font('22/28', 600, 'eloqua'),
    color: color.text('primary'),
    textDecoration: 'none',
    marginRight: 'auto',
    whiteSpace: 'nowrap',
  },
  focusVisibleRing(),
])

export const nav = style({
  ...flexRow(24),
  alignItems: 'center',
  display: 'none',
  marginRight: 'auto',
  ...media({
    lg: { display: 'flex' },
  }),
})

export const navLink = style([
  {
    font: font('15/22', 500),
    color: color.text('secondary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('primary') },
      '&[aria-current="page"]': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const actions = style({
  ...flexRow(8),
  alignItems: 'center',
})

export const account = style([
  {
    ...flexRow(6),
    alignItems: 'center',
    font: font('14/20', 500),
    color: color.text('secondary'),
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    display: 'none',
    ...media({
      sm: { display: 'inline-flex' },
    }),
  },
  focusVisibleRing(),
])

/**
 * Корзина — ссылка, а не кнопка: вложить `<button>` внутрь `<a>` нельзя,
 * поэтому внешность иконочной кнопки повторена здесь напрямую.
 */
export const cart = style([
  {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: rem(40),
    height: rem(40),
    fontSize: rem(20),
    color: color.text('secondary'),
    borderRadius: vars.radius.circle,
    textDecoration: 'none',
    transition: transition('background-color', 'color'),
    selectors: {
      '&:hover': {
        backgroundColor: color.surface('sunken'),
        color: color.text('primary'),
      },
    },
  },
  focusVisibleRing(),
])

/** Счётчик поверх иконки корзины. */
export const cartCount = style({
  position: 'absolute',
  top: rem(-2),
  right: rem(-2),
  minWidth: rem(18),
  height: rem(18),
  padding: `0 ${rem(5)}`,
  font: font('11/18', 600),
  textAlign: 'center',
  color: color.text('inverse'),
  backgroundColor: color.brand('600'),
  borderRadius: vars.radius.pill,
  pointerEvents: 'none',
})

export const menuButton = style({
  ...media({
    lg: { display: 'none' },
  }),
})

/** Полоса под шапкой: дедлайн текущего сбора. */
export const notice = style({
  backgroundColor: color.background('soft'),
  color: color.brand('800'),
  font: font('13/18', 500),
  textAlign: 'center',
  padding: `${rem(6)} ${vars.space.md}`,
})
