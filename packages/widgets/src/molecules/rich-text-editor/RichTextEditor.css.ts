import { fallbackVar, style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import {
  fieldError,
  fieldHint,
  fieldLabel,
  flexColumn,
  flexRow,
  focusRing,
  focusVisibleRing,
  richTextContent,
} from '../../styling/mixin'
import { headerOffset } from '../../styling/properties.css'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(6))

export const label = style([fieldLabel(), { cursor: 'default' }])

/**
 * Рамка — та же, что у `Textarea`: волосяная линия, радиус карточного
 * семейства (у многострочного поля пилюля съела бы углы текста) и кольцо
 * фокуса. Кольцо — по `:focus-within`: фокус живёт в `contenteditable` или
 * в кнопке панели, а рамка у них одна на двоих.
 */
export const frame = style({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
  transition: transition('border-color', 'box-shadow', 'background-color'),
  selectors: {
    '&:hover': { borderColor: color.border('strong') },
    '&:focus-within': {
      ...focusRing(),
      borderColor: color.border('focus'),
    },
  },
})

export const invalid = style({
  borderColor: color.danger('500'),
  selectors: {
    '&:hover': { borderColor: color.danger('700') },
  },
})

export const disabled = style({
  backgroundColor: color.surface('sunken'),
  color: color.text('muted'),
  cursor: 'not-allowed',
})

/**
 * Панель прилипает к верху при прокрутке длинного описания: иначе, чтобы
 * сделать жирным слово в конце текста, пришлось бы листать к кнопкам и назад.
 *
 * Не к самому верху, а под шапку сайта: та тоже прилипает, и `top: 0` прятал
 * кнопки под ней. Отступ задаёт `Header.css.ts` — там же он обнуляется, когда
 * шапка не прилипает.
 */
export const toolbar = style({
  ...flexRow(2),
  flexWrap: 'wrap',
  position: 'sticky',
  top: fallbackVar(headerOffset, '0px'),
  zIndex: 1,
  padding: vars.space.xxs,
  backgroundColor: 'inherit',
  borderBottom: border(1, color.border('subtle')),
  borderTopLeftRadius: vars.radius.xl,
  borderTopRightRadius: vars.radius.xl,
})

/**
 * Кнопка-переключатель: нажатое состояние читается подложкой, а не цветом
 * одной иконки — на тонком штрихе разницу в оттенке не видно.
 */
export const toolButton = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: rem(36),
    height: rem(36),
    fontSize: rem(18),
    color: color.text('secondary'),
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: vars.radius.md,
    cursor: 'pointer',
    transition: transition('background-color', 'color'),
    selectors: {
      '&:hover:not(:disabled)': {
        backgroundColor: color.surface('sunken'),
        color: color.text('primary'),
      },
      '&[aria-pressed="true"]': {
        backgroundColor: color.brand('100'),
        color: color.brand('800'),
      },
      '&:disabled': { opacity: 0.55, cursor: 'not-allowed' },
    },
  },
  focusVisibleRing(),
])

export const separator = style({
  width: rem(1),
  height: rem(20),
  marginInline: vars.space.xxs,
  backgroundColor: color.border('subtle'),
})

export const linkRow = style({
  ...flexRow(8),
  alignItems: 'flex-start',
  padding: vars.space.xs,
  borderBottom: border(1, color.border('subtle')),
})

export const linkInput = style({
  flex: 1,
  minWidth: 0,
})

export const body = style({
  display: 'flex',
  flexDirection: 'column',
})

/**
 * Сам `contenteditable`. Кегль и цвета — как у описания на странице товара
 * (`richTextContent` у обоих), чтобы владелец видел ровно то, что увидит
 * покупатель. Высота растёт с текстом: внутренняя прокрутка в форме, которая
 * и так прокручивается, путала бы, какая из двух сейчас едет.
 */
export const content = style({
  minHeight: rem(160),
  padding: `${vars.space.sm} ${vars.space.md}`,
  font: font('16/24'),
  color: color.text('secondary'),
  outline: 'none',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
})

richTextContent(content)

export const footer = style({
  ...flexRow(8),
  justifyContent: 'space-between',
  alignItems: 'baseline',
})

export const hint = style(fieldHint())

export const error = style(fieldError())

export const counter = style({
  font: font('12/18'),
  color: color.text('muted'),
  marginLeft: 'auto',
  flexShrink: 0,
})

export const counterOver = style({
  color: color.text('danger'),
  fontWeight: 500,
})
