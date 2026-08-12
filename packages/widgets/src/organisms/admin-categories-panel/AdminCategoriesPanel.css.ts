import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, panel, truncate } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(20))

export const list = style({
  ...flexColumn(4),
  ...panel(),
})

const rowBase = {
  padding: `${vars.space.sm} 0`,
  borderBottom: border(1, color.border('subtle')),
  selectors: {
    '&:last-child': { borderBottom: 'none' },
  },
} as const

/**
 * Строка списка. Название и кнопки стоят в ряд на любой ширине: название
 * обрезается (`truncate` в `name`/`slug`), а две иконки занимают 72px — гнать
 * их на отдельную строку значило бы удваивать высоту списка на телефоне
 * ради пустого места справа.
 */
export const row = style({
  ...rowBase,
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
})

/** Строка в режиме правки: три поля, на узком экране им нужен столбец. */
export const editRow = style({
  ...rowBase,
  ...flexColumn(12),
  ...media({
    sm: {
      ...flexRow(12),
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
  }),
})

export const info = style({
  ...flexColumn(2),
  minWidth: 0,
})

export const name = style({
  ...truncate(),
  font: font('15/22', 600),
  color: color.text('primary'),
})

export const slug = style({
  ...truncate(),
  font: font('12/18'),
  color: color.text('muted'),
})

export const rowActions = style({
  ...flexRow(8),
  alignItems: 'center',
  flexShrink: 0,
})

export const createForm = style({
  ...flexColumn(12),
  ...panel(),
  alignItems: 'flex-start',
})

export const createFields = style({
  ...flexColumn(12),
  width: '100%',
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: `minmax(0, 1fr) minmax(0, 1fr) ${rem(120)}`,
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})
