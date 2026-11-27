import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'

/**
 * Mobile first: секции - панели друг под другом на всю ширину, поля в одну
 * колонку. На широком экране форма занимает всю ширину страницы, как форма акции, -
 * иначе кнопки в шапке страницы выступают за её правый край.
 */
export const container = style({
  ...flexColumn(20),
  minWidth: 0,
})

export const switches = style(flexColumn(8))

export const actions = style({
  ...flexColumn(8),
  ...media({
    sm: { ...flexRow(8), flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  }),
})

/** Выбранные покупатели персонального кода: строка - имя и телефон, метка, «убрать». */
export const customers = style({
  ...flexColumn(8),
  listStyle: 'none',
  margin: 0,
  padding: 0,
})

export const customer = style({
  ...flexRow(8),
  alignItems: 'center',
  minWidth: 0,
})

export const person = style({
  ...flexColumn(2),
  flex: 1,
  minWidth: 0,
})
