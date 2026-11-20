import { style } from '@vanilla-extract/css'
import { border, color, font } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Mobile first: карточки друг под другом, внутри — всё в столбик, с переносом. */
export const list = style({
  ...flexColumn(12),
  listStyle: 'none',
  margin: 0,
  padding: 0,
})

export const item = style({
  ...flexColumn(6),
  padding: vars.space.md,
  backgroundColor: color.surface('muted'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
})

/** Снятое участие приглушено цветом текста, а не прозрачностью: контраст остаётся читаемым. */
export const itemReleased = style({
  backgroundColor: color.surface('base'),
})

export const top = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})

export const name = style({
  font: font('16/24', 600),
  color: color.text('primary'),
  overflowWrap: 'anywhere',
})

export const order = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})

export const orderLink = style({
  font: font('14/20', 600),
  color: color.text('brand'),
  minHeight: '44px',
  display: 'inline-flex',
  alignItems: 'center',
})

export const rewards = style({
  font: font('13/20'),
  color: color.text('secondary'),
})

export const date = style({
  font: font('12/18'),
  color: color.text('muted'),
})

export const footer = style({
  ...flexColumn(8),
  ...media({
    sm: { ...flexRow(8), justifyContent: 'flex-end' },
  }),
})
