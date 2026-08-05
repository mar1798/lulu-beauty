import { style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { tableBase, tableCell, tableHeadCell, tableWrap } from '../../styling/mixin/table'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(20))

export const panel = style({
  ...flexColumn(16),
  alignItems: 'flex-start',
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
})

export const code = style({
  font: font('13/20', 500),
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  padding: `${rem(1)} ${rem(6)}`,
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.xs,
})

export const totals = style({
  ...flexRow(24),
  flexWrap: 'wrap',
})

export const total = style(flexColumn(2))

export const totalValue = style({
  font: font('28/34', 600),
  letterSpacing: vars.tracking.display,
  color: color.text('primary'),
})

export const totalLabel = style({
  font: font('13/18'),
  color: color.text('muted'),
})

export const errorsWrap = style([tableWrap(), { boxShadow: 'none' }])

export const table = style([tableBase(), { minWidth: rem(360) }])

export const headCell = style(tableHeadCell())

export const cell = style(tableCell())

/** Номер строки — узкая колонка с моноширинными цифрами, чтобы они не «плясали». */
export const rowCell = style([
  tableCell(),
  {
    width: rem(1),
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
    color: color.text('muted'),
  },
])
