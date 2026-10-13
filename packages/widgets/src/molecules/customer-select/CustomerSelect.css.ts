import { style } from '@vanilla-extract/css'
import { border, color, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(8))

/**
 * Выдача — белой карточкой, как у `ProductPicker`: в окне заявки оба поиска
 * стоят рядом и должны читаться одним приёмом.
 */
export const list = style({
  ...flexColumn(0),
  margin: 0,
  padding: 0,
  listStyle: 'none',
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
  overflow: 'hidden',
})

export const item = style({
  selectors: {
    '&:not(:last-child)': {
      borderBottom: border(1, color.border('subtle')),
    },
  },
})

/** Строка целиком — кнопка: выбирают человека, а не мелкую кнопку рядом с ним. */
export const option = style([
  focusVisibleRing(),
  {
    ...flexRow(12),
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: rem(56),
    padding: `${rem(8)} ${vars.space.sm}`,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: transition('background-color'),
    selectors: {
      '&:hover:not(:disabled)': { backgroundColor: color.surface('sunken') },
      '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
    },
  },
])

export const person = style({
  ...flexColumn(2),
  minWidth: 0,
})

export const meta = style({
  ...flexRow(8),
  alignItems: 'center',
  flexWrap: 'wrap',
})

/** Скелетон повторяет строку выдачи — две подписи той же высоты. */
export const skeletonRow = style({
  ...flexColumn(6),
  justifyContent: 'center',
  minHeight: rem(56),
  padding: `${rem(8)} ${vars.space.sm}`,
  selectors: {
    '&:not(:last-child)': {
      borderBottom: border(1, color.border('subtle')),
    },
  },
})

/** Выбранный покупатель — карточка на месте поиска. */
export const selected = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${rem(10)} ${vars.space.sm}`,
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.lg,
})
