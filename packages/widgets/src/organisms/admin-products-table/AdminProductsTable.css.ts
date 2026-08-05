import { style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing, truncate } from '../../styling/mixin'
import {
  tableActionsCell,
  tableBase,
  tableCell,
  tableHeadCell,
  tableWrap,
} from '../../styling/mixin/table'
import { vars } from '../../styling/themes/contract.css'

export const wrap = style(tableWrap())

export const table = style(tableBase())

export const headCell = style(tableHeadCell())

export const headActionsCell = style([tableHeadCell(), { textAlign: 'right' }])

export const cell = style(tableCell())

export const actionsCell = style(tableActionsCell())

/**
 * Удалённая строка приглушена, но читаема: она нужна ровно для того, чтобы
 * её нашли и восстановили. Одной прозрачности мало — состояние дублируется
 * бейджем, потому что цвет не читается скринридером.
 */
export const deletedRow = style({
  opacity: 0.62,
})

export const product = style({
  ...flexRow(12),
  alignItems: 'center',
  minWidth: rem(240),
})

export const thumb = style({
  position: 'relative',
  flexShrink: 0,
  width: rem(48),
  height: rem(48),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.md,
  color: color.text('subtle'),
})

export const thumbIcon = style({
  fontSize: rem(20),
})

export const thumbImage = style({
  objectFit: 'cover',
})

export const productText = style({
  ...flexColumn(2),
  minWidth: 0,
})

export const name = style([
  {
    ...truncate(),
    font: font('14/20', 600),
    color: color.text('primary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const slug = style({
  ...truncate(),
  font: font('12/18'),
  color: color.text('muted'),
})

export const actions = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'flex-end',
})
