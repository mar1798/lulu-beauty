import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    gap: rem(6),
    minHeight: rem(40),
    padding: `0 ${vars.space.md}`,
    font: font('16/24', 500),
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    border: border(1, color.border('subtle')),
    borderRadius: vars.radius.pill,
    /** Категорийная пилюля из референса: белая, с волосяной рамкой и лёгким подъёмом. */
    boxShadow: vars.shadow.sm,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: transition('background-color', 'color', 'border-color', 'box-shadow'),
    selectors: {
      '&:hover:not([disabled])': {
        borderColor: color.border('strong'),
        boxShadow: vars.shadow.lg,
      },
      '&[disabled]': { opacity: 0.55, cursor: 'not-allowed' },
      /** Выбранное состояние читается и по контрасту, и по `aria-pressed`. */
      '&[aria-pressed="true"]': {
        backgroundColor: color.brand('600'),
        borderColor: color.brand('600'),
        color: color.text('inverse'),
      },
    },
  },
  focusVisibleRing(),
])

/**
 * Счётчик приглушается отдельным цветом, а не `opacity`: прозрачность
 * смешивает текст с фоном и роняет контраст ниже AA — axe это ловит.
 * У выбранного чипа цвет наследуется от инверсного текста.
 */
export const count = style({
  font: font('14/20', 500),
  color: color.text('muted'),
  selectors: {
    '[aria-pressed="true"] > &': {
      color: 'inherit',
    },
  },
})
