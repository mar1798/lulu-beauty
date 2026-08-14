import { style } from '@vanilla-extract/css'
import { media, rem } from 'widgets/styling/lib'
import { flexColumn, flexRow } from 'widgets/styling/mixin'

/**
 * Блок фильтров витрины: категория и бренд.
 *
 * Живёт в приложении, а не в `widgets`: `CatalogTemplate` держит фильтры одним
 * слотом и не знает, сколько их и какие они, — из чего этот слот собран,
 * решает страница.
 */

/** На телефоне — столбцом во всю ширину, от `sm` — парой рядом. */
export const filters = style({
  ...flexColumn(16),
  ...media({
    sm: {
      ...flexRow(16),
      alignItems: 'flex-end',
    },
  }),
})

/**
 * Фиксированная ширина полей на широком экране: тянуться во всю колонку им
 * незачем — рядом стоит поиск, и растянутые фильтры спорили бы с ним за
 * внимание. На телефоне ограничение снимается, там они в один столбец.
 */
export const field = style({
  ...media({
    sm: {
      width: rem(220),
    },
  }),
})
