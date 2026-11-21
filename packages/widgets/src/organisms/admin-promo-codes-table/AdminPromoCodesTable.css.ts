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
import { vars } from '../../styling/themes/contract.css'

/**
 * Mobile first: по умолчанию строка — карточка (код с копированием, название,
 * кому выдан, период, награды, статус, число применений и ряд иконок внизу);
 * таблицей она становится с `xl` — восемь колонок (семь с данными и колонка
 * действий) рядом с сайдбаром админки раньше не помещаются, как и у товаров.
 */
const CARD_UNTIL = 'xl'

export const wrap = style(tableWrap())

export const table = style(tableCardBase(CARD_UNTIL))

export const head = style(tableCardHead(CARD_UNTIL))

export const body = style(tableCardBody(CARD_UNTIL))

export const row = style(tableCardRow(CARD_UNTIL))

/*
  Восемь колонок в контейнере около 1000px: отступы по бокам ячеек сужены с `md` до
  `sm`, иначе одни они съедают почти 130px, и таблица вылезает за контейнер.
*/
const compactPadding = {
  ...media({
    [CARD_UNTIL]: { paddingLeft: vars.space.sm, paddingRight: vars.space.sm },
  }),
}

export const headCell = style([tableHeadCell(), compactPadding])

export const headActionsCell = style([tableHeadCell(), { textAlign: 'right' }, compactPadding])

export const cell = style([tableCardCell(CARD_UNTIL), compactPadding])

export const actionsCell = style([tableCardActionsCell(CARD_UNTIL), compactPadding])

/** Архивный код приглушён не прозрачностью (она роняет контраст текста), а цветом названия. */
export const archivedRow = style({})

export const title = style({
  ...flexColumn(2),
  minWidth: 0,
  width: '100%',
  ...media({
    [CARD_UNTIL]: { minWidth: rem(96), maxWidth: rem(180), width: 'auto' },
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

/** Сам код: моноширинный и с разрядкой - его читают с экрана и набирают заново. */
export const codeCell = style({
  ...flexRow(4),
  alignItems: 'center',
  minWidth: 0,
})

export const code = style({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: rem(14),
  fontWeight: 600,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  color: color.text('primary'),
  selectors: {
    [`${archivedRow} &`]: { color: color.text('muted') },
  },
})

/** Кому: имя и под ним телефон. */
export const person = style({
  ...flexColumn(2),
  minWidth: 0,
  textAlign: 'right',
  ...media({
    [CARD_UNTIL]: { textAlign: 'left' },
  }),
})

export const personPhone = style({
  font: font('12/18'),
  color: color.text('muted'),
})

export const statuses = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  ...media({
    [CARD_UNTIL]: { justifyContent: 'flex-start' },
  }),
})

/**
 * В карточке период в одну строку. В таблице колонка узкая, и период переносится по
 * пробелам - у дат в формате ДД.ММ.ГГГГ внутри пробелов нет, так что рвётся только
 * между датами.
 */
export const period = style({
  whiteSpace: 'nowrap',
  color: color.text('muted'),
  ...media({
    [CARD_UNTIL]: { whiteSpace: 'normal', minWidth: rem(88) },
  }),
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
    [CARD_UNTIL]: { textAlign: 'left', maxWidth: rem(160) },
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
 * пять кнопок не должны слипаться и не должны уезжать за край. Зазор 8px, как у
 * таблицы товаров: ряд из пяти `sm` занимает 192px, а не 256px прежних `lg`.
 */
export const actions = style({
  ...flexRow(8),
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
