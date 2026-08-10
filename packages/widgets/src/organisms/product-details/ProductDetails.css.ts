import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * От `md` галерея и описание встают в два столбца. Раньше они делили ширину
 * поровну — картинка выходила огромной; галерея сужена вдвое (с 1fr до 3fr
 * у соседней колонки — то есть с 50% примерно до 25% ширины), а планшет
 * специально не отделён от десктопа: с `md` до бесконечности — одна и та
 * же пропорция.
 */
export const container = style({
  ...flexColumn(32),
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3fr)',
      gap: vars.space.xxl,
      alignItems: 'start',
    },
  }),
})

export const info = style(flexColumn(16))

export const tags = style({
  ...flexRow(6),
  flexWrap: 'wrap',
})

export const priceRow = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

export const description = style({
  whiteSpace: 'pre-line',
})

export const action = style({
  marginTop: vars.space.xs,
})
