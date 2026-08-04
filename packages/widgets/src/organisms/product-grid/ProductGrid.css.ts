import { style } from '@vanilla-extract/css'
import { flexColumn, gridAutoFit } from '../../styling/mixin'

/** 220px — минимальная ширина, при которой название в две строки ещё читается. */
export const container = style(gridAutoFit(220, 24))

export const skeletonCard = style(flexColumn(10))

export const skeletonMedia = style({
  aspectRatio: '4 / 5',
  width: '100%',
  height: 'auto',
})
