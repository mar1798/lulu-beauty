import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Собственных размеров у окна нет — их задаёт `Modal size="md"`. */
export const container = style({})

export const body = style(flexColumn(16))

export const section = style(flexColumn(4))

/** Уже стоящая скидка и «Снять скидку» — одной строкой, с переносом на узком экране. */
export const current = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

/**
 * Вид и размер — рядом, начиная с планшета. Колонки `minmax(0, 1fr)`: у `1fr`
 * нижняя граница — собственная ширина поля, и оно вылезало за край окна.
 */
export const numbers = style({
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

export const totalRow = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

/** «Было» рядом с новой суммой, по базовой линии. */
export const totals = style({
  ...flexRow(12),
  alignItems: 'baseline',
})
