import { style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { tableBase, tableCell, tableHeadCell, tableWrap } from '../../styling/mixin/table'
import { vars } from '../../styling/themes/contract.css'

export const wrap = style(tableWrap())

export const table = style(tableBase())

export const headCell = style(tableHeadCell())

export const cell = style(tableCell())

export const order = style(flexColumn(2))

export const number = style({
  font: font('14/20', 600),
  fontVariantNumeric: 'tabular-nums',
  color: color.text('primary'),
})

export const date = style({
  font: font('12/18'),
  color: color.text('muted'),
})

export const customer = style(flexColumn(2))

export const customerName = style({
  font: font('14/20', 500),
  color: color.text('primary'),
})

export const phone = style([
  {
    font: font('13/18'),
    color: color.text('brand'),
    textDecoration: 'none',
    selectors: {
      '&:hover': { textDecoration: 'underline' },
    },
  },
  focusVisibleRing(),
])

export const toggle = style([
  {
    font: font('14/20', 500),
    color: color.text('brand'),
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: rem(3),
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.brand('700') },
    },
  },
  focusVisibleRing(),
])

export const detailsRow = style({
  backgroundColor: color.surface('muted'),
})

/* Ячейка остаётся табличной — flex внутри `td` сломал бы `colSpan`. */
export const detailsCell = style(tableCell())

export const items = style({
  ...flexColumn(6),
  listStyle: 'none',
})

export const item = style({
  ...flexRow(12),
  alignItems: 'baseline',
  flexWrap: 'wrap',
})

export const itemName = style({
  minWidth: rem(180),
})

export const itemLink = style([
  {
    color: color.text('primary'),
    textDecoration: 'none',
    selectors: {
      '&:hover': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const itemQuantity = style({
  font: font('13/18'),
  color: color.text('muted'),
  fontVariantNumeric: 'tabular-nums',
})

export const note = style({
  marginTop: vars.space.xs,
  font: font('13/20'),
  color: color.text('secondary'),
})
