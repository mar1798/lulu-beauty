import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, truncate } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(20))

const panel = {
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
} as const

export const list = style({
  ...flexColumn(4),
  ...panel,
})

export const row = style({
  ...flexColumn(12),
  padding: `${vars.space.sm} 0`,
  borderBottom: border(1, color.border('subtle')),
  selectors: {
    '&:last-child': { borderBottom: 'none' },
  },
  ...media({
    sm: {
      ...flexRow(12),
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
  }),
})

export const info = style({
  ...flexColumn(2),
  minWidth: 0,
})

export const name = style({
  ...truncate(),
  font: font('15/22', 600),
  color: color.text('primary'),
})

export const slug = style({
  ...truncate(),
  font: font('12/18'),
  color: color.text('muted'),
})

export const rowActions = style({
  ...flexRow(8),
  alignItems: 'center',
  flexShrink: 0,
})

export const createForm = style({
  ...flexColumn(12),
  ...panel,
  alignItems: 'flex-start',
})

export const createFields = style({
  ...flexColumn(12),
  width: '100%',
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: `minmax(0, 1fr) minmax(0, 1fr) ${rem(120)}`,
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})
