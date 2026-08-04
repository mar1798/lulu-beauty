import { style, styleVariants } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { lineClamp } from '../../styling/mixin'

export const container = style({
  margin: 0,
})

/**
 * Шкала референса: 12 — пол для вторичных подписей, 16 — рабочий размер
 * основного текста, 18 — крупный ввод. Мельче 12 не опускаемся.
 */
export const size = styleVariants({
  xs: { font: font('12/18') },
  sm: { font: font('14/20') },
  md: { font: font('16/24') },
  lg: { font: font('18/28') },
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
