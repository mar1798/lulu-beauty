import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 320px',
      gap: vars.space.xl,
      alignItems: 'start',
    },
  }),
})

export const items = style({
  ...flexColumn(0),
  borderTop: border(1, color.border('subtle')),
})

export const summary = style({
  ...flexColumn(16),
  padding: vars.space.lg,
  backgroundColor: color.surface('muted'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
  ...media({
    lg: { position: 'sticky', top: vars.space.xxl },
  }),
})

export const totalRow = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
})
