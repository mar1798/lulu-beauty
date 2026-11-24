import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { FIELD_HEIGHT } from '../../styling/mixin/field'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  minWidth: 0,
})

/**
 * Поле и кнопка «Применить» в одну строку на любой ширине. `flex-start`: под полем
 * может появиться текст ошибки, и кнопка остаётся вровень с самим полем.
 */
export const inputRow = style({
  ...flexRow(8),
  alignItems: 'flex-start',
})

export const input = style({
  flex: '1 1 auto',
  minWidth: 0,
})

/** Высотой с поле (`md` у `Button` - те же 44px), ширина по подписи. */
export const apply = style({
  flexShrink: 0,
  height: rem(FIELD_HEIGHT),
})

export const appliedBox = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md}`,
  backgroundColor: color.success('100'),
  border: border(1, color.success('300')),
  borderRadius: vars.radius.lg,
})

export const appliedText = style({
  ...flexColumn(2),
  minWidth: 0,
  overflowWrap: 'anywhere',
})

export const options = style({
  ...flexColumn(8),
})

export const optionList = style({
  ...flexColumn(8),
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

/** Строка кода во всю ширину: тап по ней применяет код, высота не меньше 44px. */
export const option = style([
  {
    ...flexColumn(2),
    alignItems: 'flex-start',
    width: '100%',
    minHeight: '44px',
    padding: `${vars.space.sm} ${vars.space.md}`,
    textAlign: 'left',
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    border: border(1, color.border('default')),
    borderRadius: vars.radius.lg,
    cursor: 'pointer',
    transition: transition('background-color', 'border-color'),
    selectors: {
      '&:hover:not([disabled])': {
        backgroundColor: color.brand('50'),
        borderColor: color.brand('300'),
      },
      '&[disabled]': { opacity: 0.55, cursor: 'not-allowed' },
    },
  },
  focusVisibleRing(),
])

export const optionCode = style({
  font: font('15/22', 600),
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.08em',
})

export const optionLabel = style({
  font: font('13/18'),
  color: color.text('muted'),
})

export const allCodes = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: '44px',
    font: font('14/20', 500),
    color: color.text('brand'),
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  focusVisibleRing(),
])
