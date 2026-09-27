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

/**
 * До какой ширины строки остаются карточками: `xl`, а не `md`, как у заявок.
 * В таблице шесть колонок, и рядом с сайдбаром админки (с `lg`) им нужно около
 * 960px — на 1024px «Наличие» и «Действия» уезжали под горизонтальную
 * прокрутку, где их никто не искал. Карточки на планшете читаются целиком.
 */
const CARD_UNTIL = 'xl'

export const wrap = style(tableWrap())

export const table = style(tableCardBase(CARD_UNTIL))

export const head = style(tableCardHead(CARD_UNTIL))

export const body = style(tableCardBody(CARD_UNTIL))

export const row = style(tableCardRow(CARD_UNTIL))

export const headCell = style(tableHeadCell())

export const headActionsCell = style([tableHeadCell(), { textAlign: 'right' }])

/**
 * Заголовок сортируемой колонки — кнопка во всю его подпись. Шрифт, регистр и
 * разрядка наследуются от ячейки: внешне заголовок остаётся заголовком, и
 * выдаёт его только стрелка и смена цвета под курсором.
 */
export const sortButton = style([
  {
    ...flexRow(4),
    alignItems: 'center',
    padding: 0,
    border: 'none',
    background: 'none',
    font: 'inherit',
    letterSpacing: 'inherit',
    textTransform: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    borderRadius: vars.radius.sm,
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('primary') },
    },
  },
  focusVisibleRing(),
])

/** Колонка, по которой сейчас отсортировано, — ярче остальных заголовков. */
export const sortButtonActive = style({
  color: color.text('primary'),
})

/**
 * Стрелка направления. У неактивной колонки она проявляется только под
 * курсором и в фокусе: шесть стрелок в ряд читались бы как шум, а подсказка
 * «здесь можно сортировать» нужна ровно в момент наведения.
 */
export const sortIcon = style({
  flexShrink: 0,
  fontSize: rem(14),
  opacity: 0,
  transition: transition('opacity', 'transform'),
  selectors: {
    [`${sortButton}:hover &, ${sortButton}:focus-visible &`]: { opacity: 0.5 },
    [`${sortButtonActive} &, ${sortButtonActive}:hover &`]: { opacity: 1 },
  },
})

/** Шеврон нарисован вниз; по возрастанию он смотрит вверх. */
export const sortIconAscending = style({
  transform: 'rotate(180deg)',
})

/**
 * Выбор сортировки для карточного режима. Шапка таблицы до `CARD_UNTIL`
 * спрятана, и вместе с ней пропадали бы кликабельные заголовки; начиная с неё,
 * наоборот, прячется поле — сортировкой там служит сама шапка.
 */
export const mobileSort = style({
  ...media({
    [CARD_UNTIL]: { display: 'none' },
  }),
})

/** Дата добавления не переносится: разорванная на две строки, она читалась бы как две даты. */
export const date = style({
  whiteSpace: 'nowrap',
  color: color.text('muted'),
})

export const cell = style(tableCardCell(CARD_UNTIL))

export const actionsCell = style(tableCardActionsCell(CARD_UNTIL))

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
 *
 * `maxWidth` — то, из-за чего многоточие у названия вообще срабатывает.
 * Ширину колонки считает браузер по её содержимому (`table-layout: auto`), и
 * ячейка просто растёт под самое длинное название; `truncate()` на названии
 * при этом бездействует — обрезать нечего. Ограничение стоит на обёртке
 * внутри ячейки, потому что `max-width` у самой `td` разметка таблицы
 * игнорирует. На карточке его нет: там ширину задаёт экран.
 */
export const product = style({
  ...flexRow(12),
  alignItems: 'center',
  minWidth: 0,
  width: '100%',
  ...media({
    [CARD_UNTIL]: { minWidth: rem(240), maxWidth: rem(340), width: 'auto' },
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
    [CARD_UNTIL]: { justifyContent: 'flex-end' },
  }),
})
