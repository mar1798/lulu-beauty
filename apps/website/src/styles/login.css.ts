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

/**
 * Обёртка кнопки-виджета Telegram — она же ножницы.
 *
 * Кнопку рисует чужой iframe с `oauth.telegram.org`, и его документ объявляет
 * себе `color-scheme: light dark`. Наш `color-scheme: light` (см.
 * `widgets/styling/preflight`) браузер обязан пробросить во вложенный документ;
 * Chromium это делает, WebKit для cross-origin iframe — нет. Поэтому на iPhone
 * (там любой браузер — WebKit) при системной тёмной теме канву iframe красят
 * чёрным, и вокруг светлой кнопки появляется чёрный прямоугольник.
 *
 * Изнутри это не поправить: чужой документ мы не стилизуем, а канва
 * непрозрачна — ни фон под iframe, ни blend-mode её не перекроют. Зато можно
 * обрезать: кнопка занимает iframe целиком (191×40 при `data-size=large`,
 * `data-radius=20`), и за её пилюлю выходят только углы. `overflow: hidden` по
 * той же форме их и срезает.
 *
 * `inline-flex` — чтобы обёртка села по размеру iframe: ширина у него своя,
 * она зависит от длины имени в подписи кнопки.
 */
export const telegramWidget = style({
  display: 'inline-flex',
  borderRadius: rem(20),
  overflow: 'hidden',
})
