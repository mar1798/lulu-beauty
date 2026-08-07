import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, grid, gridAutoFit } from '../../styling/mixin'

/**
 * На узких экранах auto-fit не срабатывает: 220px-порог не даёт даже двум
 * колонкам поместиться на 390px. Поэтому мобильная база — жёсткие 2 колонки,
 * с `sm` включается auto-fit(220, 24) — 220px — минимальная ширина, при
 * которой название в две строки ещё читается, — а с `md` колонки
 * фиксируются на четырёх: иначе auto-fit на планшетном контейнере (ýже
 * десктопного, но шире порога для пятой колонки) укладывает всего 3
 * колонки, и карточка выходит заметно крупнее десктопной. Четыре
 * колонки — то же число, что auto-fit даёт на типичной десктопной ширине.
 */
export const container = style({
  ...grid(2, 12),
  ...media({
    sm: gridAutoFit(220, 24),
    md: grid(4, 24),
  }),
})

export const skeletonCard = style(flexColumn(10))

export const skeletonMedia = style({
  aspectRatio: '4 / 5',
  width: '100%',
  height: 'auto',
})
