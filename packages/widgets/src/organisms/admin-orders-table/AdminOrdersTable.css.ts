import { style } from '@vanilla-extract/css'
import { color, font, media, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
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
import { vars } from '../../styling/themes/contract.css'

export const wrap = style(tableWrap())

export const table = style(tableCardBase())

export const head = style(tableCardHead())

export const body = style(tableCardBody())

/*
 * На карточке строка — не столбец, а ряд с переносом: статус и кнопка удаления
 * должны встать в одну строку, а остальные ячейки занимают всю ширину сами
 * (`flexBasis: 100%` ниже). Выше `md` строка снова `table-row`, и ни
 * направление, ни перенос, ни `column-gap` на неё не действуют.
 */
export const row = style({
  ...tableCardRow(),
  flexDirection: 'row',
  flexWrap: 'wrap',
  columnGap: vars.space.sm,
})

export const headCell = style(tableHeadCell())

export const headActionsCell = style([tableHeadCell(), { textAlign: 'right' }])

export const cell = style({
  ...tableCardCell(),
  flexBasis: '100%',
})

/**
 * Селект статуса. Единственная ячейка карточки без `data-label`, кроме главной:
 * подпись «Статус» над списком статусов ничего не добавляет, а строку с кнопкой
 * удаления разгоняет по высоте — без неё селект и кнопка стоят вровень.
 *
 * Делит строку с кнопкой и забирает всю ширину, кроме её. База ровно `0`, а не
 * `auto`: перенос flex решает по базовому размеру, а у `StatusSelect` это его
 * `min-width` в 210px — вместе с кнопкой они не помещались в 375px, и кнопка
 * уезжала на следующую строку, хотя по факту места хватает.
 */
export const statusCell = style({
  ...tableCardCell(),
  flexBasis: 0,
  flexGrow: 1,
  minWidth: 0,
})

/**
 * Кнопка удаления стоит рядом со статусом, а не отдельной строкой: одна
 * иконка на всю ширину карточки — это пустая строка с точкой у края.
 * По вертикали она выровнена по центру селекта статуса.
 */
export const actionsCell = style({
  ...tableCardActionsCell(),
  flexBasis: 'auto',
  flexGrow: 0,
  alignSelf: 'center',
})

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

/*
 * Состав раскрытой заявки. На широком экране ячейка остаётся табличной —
 * flex внутри `td` сломал бы `colSpan`; на карточке она уже flex (так устроен
 * `tableCell`), и её двум блокам — списку позиций и комментарию — нужен
 * столбец, иначе они встали бы рядом.
 */
export const detailsCell = style({
  ...tableCardCell(),
  flexBasis: '100%',
  flexDirection: 'column',
  alignItems: 'stretch',
  rowGap: vars.space.xs,
})

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
  ...media({
    sm: { minWidth: rem(180) },
  }),
})

/**
 * Объём приглушённой подписью после названия: он различает две строки одного
 * товара, но названием не является — набранный тем же тоном, он читался бы как
 * часть имени.
 */
export const itemVolume = style({
  marginLeft: rem(6),
  font: font('14/20', 500),
  color: color.text('muted'),
  whiteSpace: 'nowrap',
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
