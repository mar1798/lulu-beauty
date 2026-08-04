import { style } from '@vanilla-extract/css'
import { color } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  /* preflight снимает маркеры и отступы у `ul`, но не у `li` внутри flex. */
  listStyle: 'none',
})

export const card = style({
  width: '100%',
})

export const skeletonCard = style({
  ...flexColumn(10),
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
})
