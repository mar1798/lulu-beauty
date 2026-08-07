import { style } from '@vanilla-extract/css'
import { flexRow } from '../../styling/mixin'
import { media, rem } from '../../styling/lib'

export const container = style({
  ...flexRow(0),
  gap: rem(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})

export const mobileOnly = style({
  display: 'block',
  ...media({ sm: { display: 'none' } }),
})

export const desktopOnly = style({
  display: 'none',
  ...media({ sm: { display: 'flex' } }),
})
