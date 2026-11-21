import { style } from '@vanilla-extract/css'
import { border, color, font } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Mobile first: строка условия — карточка в одну колонку, поля в две колонки с `sm`. */
export const container = style(flexColumn(12))

export const row = style({
  ...flexColumn(12),
  padding: vars.space.md,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
})

export const rowHead = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'space-between',
})

export const rowTitle = style({
  font: font('14/20', 600),
  color: color.text('primary'),
})

export const fields = style({
  ...flexColumn(12),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})
