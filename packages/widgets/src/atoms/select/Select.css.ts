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

/** Нативный `<select>` на тач-экране — та же пилюля, без системной стрелки. */
export const native = style({
  width: '100%',
  appearance: 'none',
})

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
 * Подкатегория: сдвинута под свой раздел и на ступень мельче — так под
 * заголовком помещается больше строк, а разница с разделом видна не только
 * по отступу.
 */
export const nested = style({
  minHeight: rem(34),
  paddingTop: rem(6),
  paddingBottom: rem(6),
  paddingLeft: rem(28),
  font: font('14/20'),
})

/**
 * Раздел дерева — заголовок своей группы. Прилипает к верху панели, пока
 * прокручиваются его подкатегории, и уезжает вместе с последней из них —
 * держится он только в пределах своей группы (`group`), так что следующий
 * раздел его выталкивает. Подложка непрозрачная: строки под ним не просвечивают.
 *
 * Стоит до `active`/`selected`: при равной специфичности их подложка и цвет
 * должны побеждать.
 */
export const section = style({
  position: 'sticky',
  /*
    Липнет не к краю содержимого, а к краю самой панели: иначе в её
    внутреннем отступе над заголовком просвечивает уезжающая строка.
  */
  top: `calc(-1 * ${vars.space.xxs})`,
  zIndex: 1,
  fontWeight: 500,
  color: color.text('primary'),
  backgroundColor: color.surface('base'),
})

/**
 * Раздел вместе с подкатегориями: граница, в которой держится его липкий
 * заголовок. Отступ сверху отделяет группы друг от друга (и первую — от
 * «Все категории»).
 */
export const group = style({
  selectors: {
    '&:not(:first-child)': { marginTop: rem(6) },
  },
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
