import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(32),
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.xxl,
      alignItems: 'start',
    },
  }),
})

export const info = style(flexColumn(16))

export const priceRow = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

export const description = style({
  whiteSpace: 'pre-line',
})

export const action = style({
  marginTop: vars.space.xs,
})
