import { style } from '@vanilla-extract/css'
import { color, font, media, rem, transition } from '../../styling/lib'
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
import { vars } from '../../styling/themes/contract.css'

export const wrap = style(tableWrap())

export const table = style(tableCardBase())

export const head = style(tableCardHead())

export const body = style(tableCardBody())

export const row = style(tableCardRow())

export const headCell = style(tableHeadCell())

export const headActionsCell = style([tableHeadCell(), { textAlign: 'right' }])

export const cell = style(tableCardCell())

export const actionsCell = style(tableCardActionsCell())

/**
 * Удалённая строка приглушена, но читаема: она нужна ровно для того, чтобы
 * её нашли и восстановили. Состояние дублируется бейджем — цвет и яркость
 * скринридер не читает.
 *
 * Прозрачности на всей строке здесь **нет**, хотя раньше была: `opacity`
 * смешивает с фоном и текст тоже, и слаг товара падал с 4.76:1 до 2.48:1
 * (axe, serious). Приглушается только миниатюра и название — то, что и
 * должно уходить на второй план, — а адрес, цена и бейдж остаются в полном
 * цвете. Ровно та же правка, что была сделана прошлым шагом в календаре.
 */
export const deletedRow = style({})

/**
 * Название с миниатюрой. `minWidth` держит колонку в настоящей таблице, но на
 * карточке его быть не должно: 240px не влезают в экран 320px вместе с полями.
 */
export const product = style({
  ...flexRow(12),
  alignItems: 'center',
  minWidth: 0,
  width: '100%',
  ...media({
    md: { minWidth: rem(240), width: 'auto' },
  }),
})

export const thumb = style({
  position: 'relative',
  flexShrink: 0,
  width: rem(48),
  height: rem(48),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.md,
  color: color.text('subtle'),
  selectors: {
    /* Картинка — единственное, что здесь можно гасить прозрачностью: текста в ней нет. */
    [`${deletedRow} &`]: { opacity: 0.5 },
  },
})

export const thumbIcon = style({
  fontSize: rem(20),
})

export const thumbImage = style({
  // Фотография товара нигде не обрезается — см. `AppImage`/`components/Image.tsx`.
  objectFit: 'contain',
})

export const productText = style({
  ...flexColumn(2),
  minWidth: 0,
})

export const name = style([
  {
    ...truncate(),
    font: font('14/20', 600),
    color: color.text('primary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('brand') },
      /* Название удалённого товара — приглушённым цветом, а не прозрачностью: 4.76:1. */
      [`${deletedRow} &`]: { color: color.text('muted') },
    },
  },
  focusVisibleRing(),
])

export const slug = style({
  ...truncate(),
  font: font('12/18'),
  color: color.text('muted'),
})

export const actions = style({
  ...flexRow(8),
  alignItems: 'center',
  ...media({
    md: { justifyContent: 'flex-end' },
  }),
})
