import { style } from '@vanilla-extract/css'
import { color } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const hints = style({
  ...flexColumn(8),
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

export const hint = style({
  ...flexRow(10),
  alignItems: 'flex-start',
  padding: `${vars.space.sm} ${vars.space.md}`,
  backgroundColor: color.brand('50'),
  borderRadius: vars.radius.lg,
  // Тап по ссылке внутри - не меньше 44px по высоте строки.
  minHeight: '44px',
  alignContent: 'center',
})

export const hintIcon = style({
  flexShrink: 0,
  marginTop: '2px',
  fontSize: '18px',
  color: color.brand('600'),
})

export const link = style([
  {
    color: color.text('brand'),
    fontWeight: 500,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  focusVisibleRing(),
])

export const discounts = style({
  ...flexColumn(8),
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

export const row = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
})

export const amount = style({
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})
