import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  padding: vars.space.md,
  backgroundColor: color.surface('soft'),
  border: border(1, color.brand('200')),
  borderRadius: vars.radius.lg,
})

export const steps = style({
  ...flexColumn(6),
  margin: 0,
  paddingLeft: rem(20),
  font: font('14/20'),
  color: color.text('secondary'),
  // preflight гасит маркеры у всех списков — здесь нумерация осмысленная,
  // это последовательность шагов, а не перечисление.
  listStyle: 'decimal',
})

export const link = style({
  alignSelf: 'flex-start',
})
