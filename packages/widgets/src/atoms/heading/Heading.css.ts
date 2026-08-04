import { style, styleVariants } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'

export const container = style({
  color: color.text('primary'),
  textWrap: 'balance',
})

/**
 * Размер отвязан от уровня заголовка: порядок `h1…h6` диктует структура
 * страницы, а внешний вид — макет, и совпадают они далеко не всегда.
 * Заголовки набираются акцидентным Eloqua.
 */
export const size = styleVariants({
  xs: { font: font('16/22', 600, 'eloqua') },
  sm: { font: font('20/26', 600, 'eloqua') },
  md: { font: font('26/32', 600, 'eloqua') },
  lg: { font: font('34/40', 600, 'eloqua') },
  xl: { font: font('44/52', 600, 'eloqua') },
})

export const tone = styleVariants({
  primary: { color: color.text('primary') },
  brand: { color: color.text('brand') },
  inverse: { color: color.text('inverse') },
})
