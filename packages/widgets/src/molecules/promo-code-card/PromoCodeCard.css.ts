import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing, panel } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...panel(),
  ...flexColumn(16),
  minWidth: 0,
})

/** Недействующий код приглушён, но читается: по нему видно, почему он не подошёл. */
export const inactive = style({
  opacity: 0.72,
})

export const head = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

export const codeRow = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md}`,
  backgroundColor: color.brand('50'),
  borderRadius: vars.radius.lg,
  // Тап по копированию - 48px, поэтому ряд не ниже него.
  minHeight: '56px',
})

export const code = style({
  font: font('20/28', 600),
  color: color.text('primary'),
  // Код читают и вводят глазами: моноширинные символы не путают «0» и «O» в строке.
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.12em',
  overflowWrap: 'anywhere',
  userSelect: 'all',
})

export const facts = style({
  ...flexColumn(10),
  margin: 0,
})

export const fact = style({
  ...flexColumn(2),
})

export const term = style({
  font: font('13/18'),
  color: color.text('muted'),
})

export const value = style({
  margin: 0,
  font: font('15/22'),
  color: color.text('primary'),
  overflowWrap: 'anywhere',
})

export const orderLink = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    font: font('14/20', 500),
    color: color.text('brand'),
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  focusVisibleRing(),
])
