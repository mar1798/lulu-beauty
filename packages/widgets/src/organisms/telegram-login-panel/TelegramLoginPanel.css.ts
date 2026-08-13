import { style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(16),
})

export const steps = style({
  ...flexColumn(6),
  margin: 0,
  paddingLeft: rem(20),
  font: font('14/20'),
  color: color.text('secondary'),
  // preflight гасит маркеры у всех списков — здесь нумерация осмысленная:
  // это последовательность шагов, а не перечисление.
  listStyle: 'decimal',
})

export const action = style({
  marginTop: vars.space.xxs,
})

export const waiting = style({
  textAlign: 'center',
})

/**
 * QR — только там, где есть чем сканировать *другое* устройство. На телефоне
 * бот открывается той же кнопкой, а код пришлось бы наводить сам на себя.
 */
export const qr = style({
  ...flexColumn(8),
  alignItems: 'center',
  paddingTop: vars.space.md,
  borderTop: `1px solid ${color.border('subtle')}`,
  textAlign: 'center',
})
