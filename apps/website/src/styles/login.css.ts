import { style } from '@vanilla-extract/css'
import { color, rem } from 'widgets/styling/lib'
import { vars } from 'widgets/styling/theme'

/**
 * QR со ссылкой на бота. Белая подложка обязательна: код рисуется чёрным по
 * прозрачному, и на любой цветной поверхности сканер его теряет.
 */
export const qr = style({
  width: rem(180),
  height: rem(180),
  padding: vars.space.xs,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
})
