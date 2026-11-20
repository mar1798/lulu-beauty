import { style } from '@vanilla-extract/css'
import { color, font, media, rem } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing, truncate } from '../../styling/mixin'
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
import { transition } from '../../styling/lib'

/**
 * Mobile first: по умолчанию строка — карточка (название, период, статус,
 * награды, участники и ряд иконок внизу); таблицей она становится с `xl` — шесть
 * колонок рядом с сайдбаром админки раньше не помещаются, как и у товаров.
 */
const CARD_UNTIL = 'xl'

export const wrap = style(tableWrap())

export const table = style(tableCardBase(CARD_UNTIL))

export const head = style(tableCardHead(CARD_UNTIL))

export const body = style(tableCardBody(CARD_UNTIL))

export const row = style(tableCardRow(CARD_UNTIL))

export const headCell = style(tableHeadCell())

export const headActionsCell = style([tableHeadCell(), { textAlign: 'right' }])

export const cell = style(tableCardCell(CARD_UNTIL))

export const actionsCell = style(tableCardActionsCell(CARD_UNTIL))

/** Архивная акция приглушена не прозрачностью (она роняет контраст текста), а цветом названия. */
export const archivedRow = style({})

export const title = style({
  ...flexColumn(2),
  minWidth: 0,
  width: '100%',
  ...media({
    [CARD_UNTIL]: { minWidth: rem(200), maxWidth: rem(300), width: 'auto' },
  }),
})

export const name = style([
  {
    ...truncate(),
    font: font('16/24', 600),
    color: color.text('primary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('brand') },
      [`${archivedRow} &`]: { color: color.text('muted') },
    },
    ...media({
      [CARD_UNTIL]: { font: font('14/20', 600) },
    }),
  },
  focusVisibleRing(),
])

export const slug = style({
  ...truncate(),
  font: font('12/18'),
  color: color.text('muted'),
})

/** Период не переносится: две даты, разорванные на строки, читались бы как четыре. */
export const period = style({
  whiteSpace: 'nowrap',
  color: color.text('muted'),
})

export const rewards = style({
  ...flexColumn(2),
  listStyle: 'none',
  margin: 0,
  padding: 0,
  minWidth: 0,
  /* В карточке награды прижаты вправо под подпись, в таблице — слева в колонке. */
  textAlign: 'right',
  ...media({
    [CARD_UNTIL]: { textAlign: 'left', maxWidth: rem(260) },
  }),
})

export const reward = style({
  font: font('13/20'),
  color: color.text('secondary'),
})

export const count = style({
  font: font('14/20', 600),
  fontVariantNumeric: 'tabular-nums',
})

/**
 * Ряд иконок. На телефоне занимает всю строку карточки и равномерно делит её:
 * пять кнопок по 48px не должны слипаться и не должны уезжать за край.
 */
export const actions = style({
  ...flexRow(4),
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  paddingTop: rem(4),
  ...media({
    [CARD_UNTIL]: {
      flexWrap: 'nowrap',
      justifyContent: 'flex-end',
      width: 'auto',
      paddingTop: 0,
    },
  }),
})
