import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Поля окна действия: пары «дата и время» друг под другом, с `sm` - рядом. */
export const container = style(flexColumn(16))

export const pair = style({
  ...flexColumn(16),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})
