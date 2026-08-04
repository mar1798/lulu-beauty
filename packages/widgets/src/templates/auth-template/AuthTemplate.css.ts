import { style } from '@vanilla-extract/css'
import { border, color, rem } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  paddingBlock: vars.space.xxl,
  paddingInline: vars.space.md,
})

export const card = style({
  ...flexColumn(20),
  width: '100%',
  maxWidth: rem(420),
  padding: vars.space.xl,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
  boxShadow: vars.shadow.sm,
})

export const head = style(flexColumn(6))

export const footer = style({
  textAlign: 'center',
})
