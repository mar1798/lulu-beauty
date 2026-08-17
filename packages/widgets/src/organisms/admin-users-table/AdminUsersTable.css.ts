import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { focusVisibleRing, truncate } from '../../styling/mixin'
import {
  tableCardActionsCell,
  tableCardBase,
  tableCardBody,
  tableCardCell,
  tableCardHead,
  tableCardRow,
  tableHeadCell,
  tableWrap,
} from '../../styling/mixin/table'

export const wrap = style(tableWrap())

export const table = style(tableCardBase())

export const head = style(tableCardHead())

export const body = style(tableCardBody())

export const row = style(tableCardRow())

export const headCell = style(tableHeadCell())

export const headActionsCell = style([tableHeadCell(), { textAlign: 'right' }])

export const cell = style(tableCardCell())

export const actionsCell = style(tableCardActionsCell())

export const name = style([
  {
    font: font('15/22', 500),
    color: color.text('primary'),
  },
  truncate(),
])

/** Телефон — моноширинным: в столбце из двадцати номеров глаз ищет по цифрам. */
export const phone = style([
  {
    font: font('14/20'),
    color: color.text('secondary'),
    textDecoration: 'none',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  focusVisibleRing(),
])
