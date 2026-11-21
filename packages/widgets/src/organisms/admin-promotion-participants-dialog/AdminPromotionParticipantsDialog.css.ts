import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import {
  tableCardBase,
  tableCardBody,
  tableCardCell,
  tableCardHead,
  tableCardRow,
  tableHeadCell,
  tableWrap,
} from '../../styling/mixin/table'

export const content = style(flexColumn(16))

export const wrap = style(tableWrap())

export const table = style(tableCardBase())

export const head = style(tableCardHead())

export const body = style(tableCardBody())

export const row = style(tableCardRow())

/** Снятое участие приглушено цветом текста, а не прозрачностью: контраст остаётся читаемым. */
export const rowReleased = style({
  color: color.text('muted'),
})

export const headCell = style(tableHeadCell())

/** Суммы прижаты вправо: в столбце их сравнивают по разрядам. */
export const headAmountCell = style([tableHeadCell(), { textAlign: 'right' }])

export const cell = style(tableCardCell())

export const amountCell = style([
  tableCardCell(),
  {
    whiteSpace: 'nowrap',
    ...media({ md: { textAlign: 'right' } }),
  },
])

export const customer = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})

export const name = style({
  font: font('15/22', 600),
  color: color.text('primary'),
  overflowWrap: 'anywhere',
})

export const order = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})

export const orderLink = style({
  font: font('14/20', 600),
  color: color.text('brand'),
  minHeight: '44px',
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
})

export const rewards = style({
  font: font('13/20'),
  color: color.text('secondary'),
})

export const date = style({
  font: font('13/20'),
  color: color.text('muted'),
  whiteSpace: 'nowrap',
})

export const footer = style({
  ...flexColumn(8),
  ...media({
    sm: { ...flexRow(8), justifyContent: 'flex-end' },
  }),
})
