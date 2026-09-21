import { style } from '@vanilla-extract/css'
import { border, color, rem, transition } from '../../styling/lib'
import { focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.sm,
})

export const option = style([
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(84),
    minHeight: rem(44),
    padding: `${rem(8)} ${vars.space.lg}`,
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    border: border(1, color.border('subtle')),
    /**
     * Пилюля: в кнопке одна строка — объём, — и она стоит в одном ряду с
     * метками над заголовком и кнопками действий, у которых края круглые.
     * Прямоугольник со скруглением был нужен, пока под объёмом шла вторая
     * строка с ценой, и вместе они превращали пилюлю в овал.
     */
    borderRadius: vars.radius.pill,
    boxShadow: vars.shadow.sm,
    cursor: 'pointer',
    transition: transition('background-color', 'color', 'border-color', 'box-shadow'),
    selectors: {
      '&:hover': {
        borderColor: color.border('strong'),
        boxShadow: vars.shadow.lg,
      },
      /**
       * Выбранное состояние читается и по контрасту, и по `aria-checked` —
       * одним цветом скринридеру его не передать.
       */
      '&[aria-checked="true"]': {
        backgroundColor: color.brand('600'),
        borderColor: color.brand('600'),
        color: color.text('inverse'),
      },
    },
  },
  focusVisibleRing(),
])

/**
 * Объём наследует цвет кнопки, а не берёт свой.
 *
 * Атом `Text` красит себя сам, и на выбранной кнопке это перебивало
 * `color: text.inverse`: объём оставался почти чёрным на сливовом фоне.
 */
export const volume = style({
  color: 'inherit',
})
