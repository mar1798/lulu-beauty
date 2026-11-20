import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow, truncate } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Mobile first: группы друг под другом, метки на всю ширину колонки.
 */
export const container = style({
  ...flexColumn(16),
  margin: 0,
  minWidth: 0,
  padding: vars.space.md,
  backgroundColor: color.surface('muted'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
})

export const legend = style({
  padding: `0 ${vars.space.xs}`,
  font: font('14/20', 600),
  color: color.text('primary'),
})

export const note = style({
  margin: 0,
  font: font('13/20'),
  color: color.text('muted'),
})

export const group = style(flexColumn(8))

export const groupTitle = style({
  font: font('12/18', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  color: color.text('muted'),
})

export const tags = style({
  ...flexColumn(6),
  listStyle: 'none',
  margin: 0,
  padding: 0,
})

export const tag = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'space-between',
  minWidth: 0,
  paddingLeft: vars.space.md,
  paddingRight: vars.space.xs,
  minHeight: rem(44),
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.pill,
})

export const tagLabel = style({
  ...truncate(),
  font: font('14/20'),
  color: color.text('primary'),
})
