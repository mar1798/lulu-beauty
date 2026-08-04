import { style, styleVariants } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { lineClamp } from '../../styling/mixin'

export const container = style({
  margin: 0,
})

export const size = styleVariants({
  xs: { font: font('12/18') },
  sm: { font: font('14/20') },
  md: { font: font('15/22') },
  lg: { font: font('17/26') },
})

export const weight = styleVariants({
  regular: { fontWeight: 400 },
  medium: { fontWeight: 500 },
  semibold: { fontWeight: 600 },
})

export const tone = styleVariants({
  primary: { color: color.text('primary') },
  secondary: { color: color.text('secondary') },
  muted: { color: color.text('muted') },
  inverse: { color: color.text('inverse') },
  brand: { color: color.text('brand') },
  danger: { color: color.text('danger') },
  success: { color: color.text('success') },
})

/** Обрезка в N строк — названия товаров и описания в карточках. */
export const clamp = styleVariants({
  1: lineClamp(1),
  2: lineClamp(2),
  3: lineClamp(3),
})
