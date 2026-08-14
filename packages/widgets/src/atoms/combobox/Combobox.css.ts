import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'
import {
  fieldError,
  fieldHint,
  fieldInput,
  fieldInvalid,
  fieldLabel,
  fieldShell,
  flexColumn,
  flexRow,
} from '../../styling/mixin'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

/**
 * «Пилюля» та же, что у `Input`: поле стоит с ним в одной колонке формы,
 * и любое расхождение по высоте или радиусу читается как чужой контрол.
 * Место справа — под кнопку раскрытия.
 */
export const shell = style([
  fieldShell(),
  {
    position: 'relative',
    paddingRight: rem(4),
    selectors: {
      /*
        Открытое поле подсвечено как сфокусированное и без фокуса внутри:
        на тач-устройствах список раскрывают кнопкой, клавиатура не всплывает,
        и иначе не видно, какому полю принадлежит висящий поверх список.
      */
      '&[data-open="true"]': { borderColor: color.border('focus') },
    },
  },
])

export const invalid = style(fieldInvalid())

export const disabled = style({
  backgroundColor: color.surface('sunken'),
  color: color.text('muted'),
  cursor: 'not-allowed',
})

export const input = style(fieldInput())

/** Кнопка раскрытия: показать весь список, не стирая набранное. */
export const toggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: rem(32),
  height: rem(32),
  padding: 0,
  fontSize: rem(18),
  color: color.text('muted'),
  background: 'none',
  border: 'none',
  borderRadius: vars.radius.pill,
  cursor: 'pointer',
  transition: transition('color', 'transform'),
  selectors: {
    '&:hover:not(:disabled)': { color: color.text('primary') },
    '&:disabled': { cursor: 'not-allowed' },
    '&[aria-expanded="true"]': { transform: 'rotate(180deg)' },
  },
})

/**
 * Список рендерится порталом и позиционируется `fixed` по координатам поля —
 * ровно как у `Select`: поле может стоять в контейнере с прокруткой, и любой
 * список внутри потока там обрезало бы его `overflow`.
 */
export const popover = style({
  position: 'fixed',
  zIndex: vars.zIndex.popover,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: vars.space.xxs,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.xl,
})

/** Точка, от которой список «вырастает»: всегда со стороны поля. */
export const origin = styleVariants({
  bottom: { transformOrigin: 'top center' },
  top: { transformOrigin: 'bottom center' },
})

export const list = style({
  ...flexColumn(2),
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

export const option = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: rem(40),
  padding: `${rem(8)} ${vars.space.sm}`,
  font: font('15/22'),
  color: color.text('secondary'),
  borderRadius: vars.radius.md,
  cursor: 'pointer',
  userSelect: 'none',
  transition: transition('background-color', 'color'),
})

/**
 * Подсветка «на что нажмётся» одна и для мыши, и для клавиатуры: фокус
 * остаётся в поле (`aria-activedescendant`), поэтому своей рамки у строки нет.
 */
export const active = style({
  backgroundColor: color.surface('sunken'),
  color: color.text('primary'),
})

/** Строка, совпадающая с набранным (пусть и в другом регистре). */
export const selected = style({
  color: color.text('brand'),
  fontWeight: 500,
  backgroundColor: color.brand('50'),
})

export const optionLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const check = style({
  flexShrink: 0,
  fontSize: rem(16),
})

/** «Ничего не найдено»: подсказка, а не строка списка — нажимать не на что. */
export const empty = style({
  padding: `${rem(8)} ${vars.space.sm}`,
  font: font('15/22'),
  color: color.text('muted'),
})

export const hint = style(fieldHint())

export const error = style(fieldError())
