import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'
import {
  fieldControl,
  fieldError,
  fieldHint,
  fieldInvalid,
  fieldLabel,
  flexColumn,
  flexRow,
} from '../../styling/mixin'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

/** Обёртка нужна только чтобы стрелка стояла поверх кнопки-поля. */
export const shell = style({
  position: 'relative',
  display: 'flex',
})

/**
 * Кнопка, открывающая список, носит ту же «пилюлю», что `Input` и `Textarea`:
 * в форме она стоит с ними в одной колонке, и любое расхождение по высоте или
 * радиусу читается как чужой контрол.
 */
export const control = style([
  fieldControl(),
  {
    ...flexRow(8),
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    textAlign: 'left',
    /** Место под стрелку: она стоит в 16px от края пилюли и сама 18px шириной. */
    paddingRight: vars.space.xxl,
    selectors: {
      /*
        Открытое поле подсвечено как сфокусированное: пока список висит поверх
        страницы, должно быть видно, какому именно полю он принадлежит.
      */
      '&[aria-expanded="true"]': { borderColor: color.border('focus') },
    },
  },
])

export const invalid = style(fieldInvalid())

/** Выбранное значение; обрезается многоточием — длинные названия категорий не редкость. */
export const value = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** Ничего не выбрано: подпись-заглушка приглушена, как placeholder у `Input`. */
export const placeholder = style({
  color: color.text('muted'),
})

export const chevron = style({
  position: 'absolute',
  right: vars.space.md,
  top: '50%',
  fontSize: rem(18),
  color: color.text('muted'),
  pointerEvents: 'none',
  transform: 'translateY(-50%)',
  transition: transition('transform'),
  selectors: {
    [`${control}[aria-expanded="true"] ~ &`]: {
      transform: 'translateY(-50%) rotate(180deg)',
    },
  },
})

/**
 * Список рендерится порталом и позиционируется `fixed` по координатам поля:
 * `StatusSelect` живёт в строке админской таблицы с горизонтальной прокруткой,
 * и любой список внутри потока там обрезался бы её `overflow`.
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

/**
 * Строка списка. Скругление на ступень меньше панели — иначе подсветка
 * наведения упирается углами в её собственные скруглённые углы.
 */
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
 * остаётся на самом поле (`aria-activedescendant`), поэтому своей рамки
 * у строки нет — вести взгляд может только заливка.
 */
export const active = style({
  backgroundColor: color.surface('sunken'),
  color: color.text('primary'),
})

/** Уже выбранное: марочная подложка и галочка справа. */
export const selected = style({
  color: color.text('brand'),
  fontWeight: 500,
  backgroundColor: color.brand('50'),
})

export const disabled = style({
  color: color.text('subtle'),
  cursor: 'not-allowed',
  selectors: {
    [`&${active}`]: { backgroundColor: 'transparent', color: color.text('subtle') },
  },
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

export const hint = style(fieldHint())

export const error = style(fieldError())
