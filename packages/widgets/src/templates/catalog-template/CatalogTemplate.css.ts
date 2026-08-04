import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Между крупными блоками каталога — 48px: макет должен «дышать». */
export const container = style({
  ...flexColumn(48),
  paddingBlock: vars.space.xxl,
})

export const head = style(flexColumn(8))

export const controls = style({
  ...flexColumn(16),
  ...media({
    md: {
      ...flexRow(24),
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
  }),
})

export const pagination = style({
  marginTop: vars.space.sm,
})
