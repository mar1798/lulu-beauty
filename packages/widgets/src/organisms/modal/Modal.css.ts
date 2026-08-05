import { style, styleVariants } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: vars.zIndex.modal,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.md,
  backgroundColor: color.surface('overlay', 0.45),
  /* Окно выше экрана прокручивается вместе с затемнением, а не обрезается им. */
  overflowY: 'auto',
})

export const dialog = style({
  ...flexColumn(16),
  width: '100%',
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.xl,
  /* Ловушка фокуса ставит фокус на само окно, если внутри фокусировать нечего. */
  outline: 'none',
})

export const size = styleVariants({
  sm: { maxWidth: rem(420) },
  md: { maxWidth: rem(560) },
  lg: { maxWidth: rem(820) },
})

export const head = style({
  ...flexRow(12),
  alignItems: 'flex-start',
  justifyContent: 'space-between',
})

export const title = style({
  font: font('20/28', 600),
  letterSpacing: vars.tracking.display,
  color: color.text('primary'),
})

export const close = style({
  marginRight: rem(-8),
  marginTop: rem(-4),
})

export const body = style({
  ...flexColumn(12),
  minWidth: 0,
})

export const footer = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
})
