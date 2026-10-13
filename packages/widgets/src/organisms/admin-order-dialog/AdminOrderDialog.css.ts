import { style } from '@vanilla-extract/css'
import { flexColumn, flexRow } from '../../styling/mixin'

export const container = style({})

/** Шаги окна — покупатель, сбор, товары, комментарий — одной колонкой. */
export const body = style(flexColumn(20))

export const section = style(flexColumn(8))

export const items = style(flexColumn(0))

export const totalRow = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})
