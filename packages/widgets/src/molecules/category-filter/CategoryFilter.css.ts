import { style } from '@vanilla-extract/css'
import { flexRow } from '../../styling/mixin'
import { media, rem } from '../../styling/lib'

export const container = style({
  ...flexRow(0),
  gap: rem(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})

/**
 * Столбец вместо строки: в боковой колонке админки чипы не переносятся
 * строкой, а идут списком во всю её ширину.
 */
export const column = style({
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: rem(4),
  flexWrap: 'nowrap',
})

export const mobileOnly = style({
  display: 'block',
  ...media({ sm: { display: 'none' } }),
})

export const desktopOnly = style({
  display: 'none',
  ...media({ sm: { display: 'flex' } }),
})
