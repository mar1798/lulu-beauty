import { style } from '@vanilla-extract/css'
import { border, color, font, media, rem, transition } from '../../styling/lib'
import { flexColumn, focusVisibleRing, tableHeadCell, tableWrap } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Чек-лист открывают с телефона, стоя у полки, поэтому раскладка считается от
 * узкого экрана: пять колонок помещаются в 360px без прокрутки и без
 * карточного режима остальных таблиц админки — строку здесь читают целиком,
 * слева направо, как пункт списка покупок.
 */

const cellPadding = {
  padding: `${vars.space.sm} ${vars.space.xs}`,
  ...media({ md: { padding: `${vars.space.sm} ${vars.space.md}` } }),
}

/**
 * Числовые колонки на телефоне отступают только слева: зазор между соседними
 * числами даёт левый отступ следующей, а правый у каждой отнимал у названия
 * товара ещё по 8px. Последней колонке правый край возвращается — до края
 * карточки, как у чекбоксов слева.
 */
const numberPadding = {
  // Слева `lg`, а не `xs`: при 8px количество и цена сливались в одно число
  // («12 99 999»).
  padding: `${vars.space.sm} 0 ${vars.space.sm} ${vars.space.lg}`,
  selectors: {
    '&:last-child': { paddingInlineEnd: vars.space.sm },
  },
  ...media({ md: { padding: `${vars.space.sm} ${vars.space.md}` } }),
}

export const wrap = style(tableWrap())

export const progress = style({
  ...flexColumn(8),
  padding: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
})

export const progressLabel = style({
  font: font('14/20', 500),
  color: color.text('secondary'),
  fontVariantNumeric: 'tabular-nums',
})

export const progressTrack = style({
  height: rem(6),
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.pill,
})

/**
 * Заполнение растягивается `scaleX`, а не шириной: анимация ширины пересчитывает
 * раскладку на каждом кадре. Скругление даёт дорожка (`overflow: hidden`) —
 * своё у полосы при сжатии исказилось бы.
 */
export const progressFill = style({
  width: '100%',
  height: '100%',
  backgroundColor: color.success('500'),
  transformOrigin: 'left center',
  transition: transition('transform'),
})

export const table = style({
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
})

export const headCell = style([tableHeadCell(), cellPadding])

/** Подписи короткие и не переносятся (`nowrap` из `tableHeadCell`). */
export const headNumberCell = style([tableHeadCell(), numberPadding, { textAlign: 'right' }])

export const row = style({
  cursor: 'pointer',
  // Свою подсветку нажатия даёт зелёная заливка, системная серая её только смазывает.
  WebkitTapHighlightColor: 'transparent',
  transition: transition('background-color'),
  selectors: {
    '&[data-checked="true"]': { backgroundColor: color.success('100') },
  },
  '@media': {
    '(hover: hover)': {
      selectors: {
        '&:hover:not([data-checked="true"])': { backgroundColor: color.surface('muted') },
      },
    },
  },
})

const cellBase = {
  ...cellPadding,
  font: font('14/20'),
  color: color.text('primary'),
  borderBottom: border(1, color.border('subtle')),
  verticalAlign: 'middle',
} as const

export const checkCell = style({
  ...cellBase,
  width: rem(1),
  paddingInlineStart: vars.space.sm,
  ...media({ md: { padding: `${vars.space.sm} ${vars.space.md}` } }),
})

/**
 * Зазор чекбокса под подпись здесь лишний: подпись спрятана, а колонке на
 * телефоне дорог каждый пиксель.
 */
export const checkbox = style({
  columnGap: 0,
  // Отметка — главное действие строки: палец должен попадать в неё без прицеливания.
  padding: vars.space.xxs,
  margin: `calc(-1 * ${vars.space.xxs})`,
})

export const nameCell = style(cellBase)

export const name = style({
  display: 'block',
  font: font('15/20', 500),
  /*
    `break-word`, а не `anywhere`: с `anywhere` таблица считает, что колонку
    можно сжать до одной буквы, и при пятизначных ценах резала слова
    посередине («экстракто / м»). Так колонка не уже самого длинного слова, а
    рвётся только слово, которое не влезает и в целую строку.
  */
  overflowWrap: 'break-word',
  // Длинное слово переносится по слогам («экстрак-том») — страница `lang="ru"`.
  hyphens: 'auto',
})

/**
 * Ссылка видна как ссылка — подчёркиванием, а не цветом: цвет в строке уже
 * занят зелёной отметкой.
 */
export const nameLink = style([
  {
    color: 'inherit',
    textDecoration: 'underline',
    textDecorationColor: color.border('strong'),
    textUnderlineOffset: rem(3),
    selectors: {
      '&:hover': { color: color.text('brand'), textDecorationColor: 'currentColor' },
    },
  },
  focusVisibleRing(),
])

export const meta = style({
  display: 'block',
  marginTop: rem(2),
  font: font('13/18'),
  color: color.text('muted'),
})

export const numberCell = style({
  ...cellBase,
  ...numberPadding,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
})

/** Количество — то, что сверяют с полкой, поэтому крупнее и жирнее цены. */
export const quantity = style({
  font: font('16/20', 600),
})

export const foot = style({
  padding: `${vars.space.sm} ${vars.space.sm}`,
  font: font('14/20', 600),
  color: color.text('primary'),
  ...media({ md: { padding: `${vars.space.sm} ${vars.space.md}` } }),
})

/** Числа итога прижаты вправо, к колонкам чисел; переносятся целиком, если не влезли. */
export const footTotals = style({
  float: 'right',
  marginInlineStart: vars.space.sm,
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
})
