import { keyframes, style } from '@vanilla-extract/css'
import { media } from 'widgets/styling/lib'

/**
 * Подмена иконки в круглой кнопке «в корзину»: галочка подтверждения уступает
 * место корзине (см. `AddToCartButton`).
 *
 * Стиль живёт в приложении, а не в `widgets`: сама кнопка тоже там —
 * `IconButton` про смену состояний ничего не знает и принимает иконку слотом.
 */

/**
 * Иконка проявляется с лёгким увеличением. Масштаб, а не сдвиг: кнопка
 * круглая, ехать иконке внутри неё некуда, а «поп» из центра читается как
 * ответ на действие.
 */
const swapIn = keyframes({
  from: { opacity: 0, transform: 'scale(0.72)' },
  to: { opacity: 1, transform: 'scale(1)' },
})

/**
 * Обёртка иконки. Ключ на ней меняется вместе с иконкой, поэтому React
 * пересоздаёт узел — и анимация играет заново на каждой подмене.
 *
 * Длительность короткая: подмена не сообщение, а смена знака, и задерживать
 * на ней взгляд нечем. При `prefers-reduced-motion` гасим длительность —
 * иконка встаёт на место мгновенно, но состояние всё равно меняется.
 */
export const iconSwap = style({
  display: 'flex',
  animationName: swapIn,
  animationDuration: '200ms',
  animationTimingFunction: 'ease-out',
  ...media({
    preferReducedMotion: { animationDuration: '1ms' },
  }),
})
