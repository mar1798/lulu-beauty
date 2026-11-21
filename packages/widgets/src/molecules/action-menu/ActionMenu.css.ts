import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  display: 'inline-flex',
})

/** Панель - та же, что у списка `Select`: порталом, `fixed` по координатам кнопки. */
export const popover = style({
  position: 'fixed',
  zIndex: vars.zIndex.popover,
  minWidth: rem(200),
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: vars.space.xxs,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.xl,
})

/** Меню «вырастает» из угла кнопки: оно выровнено по её правому краю. */
export const origin = styleVariants({
  bottom: { transformOrigin: 'top right' },
  top: { transformOrigin: 'bottom right' },
})

export const list = style({
  ...flexColumn(2),
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

/**
 * Пункт. Фокус в меню и есть подсветка: пункт получает его и стрелками, и
 * наведением не получает - поэтому подложка одна на `:hover` и `:focus-visible`.
 */
export const item = style({
  ...flexRow(10),
  alignItems: 'center',
  width: '100%',
  minHeight: rem(40),
  padding: `${rem(8)} ${vars.space.sm}`,
  font: font('14/20'),
  color: color.text('secondary'),
  textAlign: 'left',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.md,
  cursor: 'pointer',
  outline: 'none',
  transition: transition('background-color', 'color'),
  selectors: {
    '&:hover, &:focus-visible': {
      backgroundColor: color.surface('sunken'),
      color: color.text('primary'),
    },
  },
})

export const danger = style({
  color: color.text('danger'),
  selectors: {
    '&:hover, &:focus-visible': { color: color.text('danger') },
  },
})

export const disabled = style({
  color: color.text('subtle'),
  cursor: 'not-allowed',
  selectors: {
    '&:hover, &:focus-visible': { backgroundColor: 'transparent', color: color.text('subtle') },
  },
})

export const icon = style({
  display: 'inline-flex',
  flexShrink: 0,
  fontSize: rem(16),
})
