import { style } from '@vanilla-extract/css'
import { color, rem } from 'widgets/styling/lib'
import { vars } from 'widgets/styling/theme'

/**
 * Место под QR. Белая подложка обязательна: код рисуется чёрным по
 * прозрачному, и на любой цветной поверхности сканер его теряет.
 *
 * Размер задан подложке, а не картинке, и стоит она на экране с самого начала,
 * пустой: кодирование отложено до простоя браузера (`useQrCode`), и без
 * заранее занятого места готовый код въезжал бы в собранный экран, сдвигая
 * всё, что ниже.
 */
export const qr = style({
  width: rem(180),
  height: rem(180),
  padding: vars.space.xs,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
})

/** Код занимает подложку целиком: размер держит она (см. выше). */
export const qrImage = style({
  display: 'block',
  width: '100%',
  height: '100%',
})
