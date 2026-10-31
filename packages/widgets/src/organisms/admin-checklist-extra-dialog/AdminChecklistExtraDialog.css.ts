import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Собственных размеров у окна нет — их задаёт `Modal size="sm"`. */
export const container = style({})

export const body = style(flexColumn(16))

/**
 * Количество и цена — короткие числа: рядом, начиная с планшета.
 *
 * Колонки `minmax(0, 1fr)`, а не `1fr`: у `1fr` нижняя граница — собственная
 * ширина поля ввода, и поле цены вылезало за край окна. `alignItems: start` —
 * подсказка под ценой не растягивает поле количества по высоте.
 */
export const numbers = style({
  ...flexColumn(16),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})
