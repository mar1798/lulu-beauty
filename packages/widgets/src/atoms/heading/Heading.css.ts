import { style, styleVariants } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  color: color.text('primary'),
  textWrap: 'balance',
})

/**
 * Размер отвязан от уровня заголовка: порядок `h1…h6` диктует структура
 * страницы, а внешний вид — макет, и совпадают они далеко не всегда.
 * Заголовки набираются акцидентным Eloqua.
 *
 * Иерархию держит не жир (везде 600, выше не поднимаемся), а трекинг: чем
 * крупнее кегль, тем сильнее стягивается строка — подпись референса.
 */
export const size = styleVariants({
  xs: { font: font('16/22', 600, 'eloqua'), letterSpacing: vars.tracking.display },
  sm: { font: font('20/26', 600, 'eloqua'), letterSpacing: vars.tracking.display },
  md: { font: font('26/32', 600, 'eloqua'), letterSpacing: vars.tracking.tight },
  lg: { font: font('34/40', 600, 'eloqua'), letterSpacing: vars.tracking.tight },
  xl: { font: font('44/52', 600, 'eloqua'), letterSpacing: vars.tracking.tight },
})

export const tone = styleVariants({
  primary: { color: color.text('primary') },
  brand: { color: color.text('brand') },
  inverse: { color: color.text('inverse') },
})
