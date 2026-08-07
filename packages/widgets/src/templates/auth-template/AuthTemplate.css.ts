import { style } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
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
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
  ...media({ sm: { padding: vars.space.xl } }),
})

export const head = style(flexColumn(6))

export const footer = style({
  textAlign: 'center',
})
