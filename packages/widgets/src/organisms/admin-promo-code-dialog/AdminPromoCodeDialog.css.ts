import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({})

/** Mobile first: всё в одну колонку, окно прокручивается само (см. `Modal`). */
export const body = style(flexColumn(20))

export const section = style(flexColumn(12))

export const sectionTitle = style({
  margin: 0,
  font: font('16/24', 600),
  color: color.text('primary'),
})

export const dates = style({
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

/** На телефоне кнопки друг под другом и на всю ширину (`isFullWidth="mobile"`), с `sm` — в ряд справа. */
export const footer = style({
  ...flexColumn(8),
  ...media({
    sm: { ...flexRow(8), justifyContent: 'flex-end' },
  }),
})
