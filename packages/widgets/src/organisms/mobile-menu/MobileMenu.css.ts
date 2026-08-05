import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Затемнение прижато к верху: панель приезжает сверху, и открытый низ экрана
 * остаётся зоной закрытия — по нему удобно попасть большим пальцем.
 */
export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: vars.zIndex.drawer,
  display: 'flex',
  alignItems: 'flex-start',
  backgroundColor: color.surface('overlay', 0.45),
  /* Панель нужна только там, где в шапке спрятана навигация. */
  ...media({
    lg: { display: 'none' },
  }),
})

export const panel = style({
  ...flexColumn(0),
  width: '100%',
  maxHeight: '100dvh',
  overflowY: 'auto',
  paddingBottom: vars.space.xs,
  backgroundColor: color.surface('base'),
  borderBottomLeftRadius: vars.radius.xxl,
  borderBottomRightRadius: vars.radius.xxl,
  boxShadow: vars.shadow.xl,
  /* Ловушка фокуса ставит фокус на саму панель, если внутри фокусировать нечего. */
  outline: 'none',
})

export const head = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: rem(72),
  paddingInline: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
})

export const nav = style({
  ...flexColumn(0),
  paddingBlock: vars.space.xs,
})

export const account = style({
  ...flexColumn(0),
  paddingTop: vars.space.xs,
  borderTop: border(1, color.border('subtle')),
})

/**
 * Пункт — во всю ширину и высотой в 56 px: попадать по нему нужно пальцем,
 * а не курсором, поэтому цель заметно крупнее, чем в шапке.
 */
export const navLink = style([
  {
    ...flexRow(12),
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: rem(56),
    paddingInline: vars.space.md,
    font: font('16/24', 500),
    color: color.text('primary'),
    textDecoration: 'none',
    transition: transition('background-color', 'color'),
    selectors: {
      '&:hover': { backgroundColor: color.surface('sunken') },
      '&[aria-current="page"]': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const rowWithIcon = style({
  ...flexRow(10),
  alignItems: 'center',
})

/** Счётчик корзины — тот же, что в шапке, но в строке, а не поверх иконки. */
export const count = style({
  minWidth: rem(22),
  padding: `${rem(2)} ${rem(7)}`,
  font: font('12/18', 600),
  textAlign: 'center',
  color: color.text('inverse'),
  backgroundColor: color.brand('600'),
  borderRadius: vars.radius.pill,
})
