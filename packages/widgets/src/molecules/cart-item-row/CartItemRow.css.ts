import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(16),
  alignItems: 'flex-start',
  paddingBlock: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
})

export const media64 = style({
  position: 'relative',
  flexShrink: 0,
  width: '64px',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
})

export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: color.text('subtle'),
})

export const body = style({
  ...flexColumn(8),
  flex: 1,
  minWidth: 0,
})

export const name = style([
  {
    color: color.text('primary'),
    textDecoration: 'none',
  },
  focusVisibleRing(),
])

export const controls = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

export const total = style({
  ...flexColumn(8),
  alignItems: 'flex-end',
  flexShrink: 0,
  ...media({
    md: { minWidth: '120px' },
  }),
})
