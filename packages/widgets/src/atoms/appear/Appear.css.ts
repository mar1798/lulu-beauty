import { keyframes, style } from '@vanilla-extract/css'
import { APPEAR_DURATION_MS, APPEAR_OFFSET } from '../../utils/motion'

/**
 * Появление сделано на CSS, а не на Motion, намеренно.
 *
 * У Motion начальное состояние попадает в разметку сервера, то есть блок
 * приезжает к человеку прозрачным и остаётся таким до гидратации. На каталоге
 * это било по самому ценному: товары есть в HTML, их видно поисковику, а на
 * экране до загрузки скриптов — пустое место, которое потом «вспыхивает».
 * CSS-анимация играет с первой же отрисовки и от JS не зависит вовсе.
 */

const rise = keyframes({
  from: { opacity: 0, transform: `translateY(${APPEAR_OFFSET}px)` },
  to: { opacity: 1, transform: 'translateY(0)' },
})

/** При `prefers-reduced-motion` остаётся одна прозрачность — движение убирается. */
const fade = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

/**
 * Обёртка не должна ничего менять в раскладке: она добавляет один блок в
 * поток, и минимальная ширина по содержимому здесь важна — без неё длинная
 * таблица внутри не даёт обёртке сжаться и ломает сетку вокруг.
 *
 * `will-change` не ставим: анимируются `opacity` и `transform`, слой браузер
 * поднимает сам (см. `best-practices` скилла `/motion`).
 */
export const container = style({
  minWidth: 0,
  animationName: rise,
  animationDuration: `${APPEAR_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  // `both`: до старта (в том числе на время `delay`) держится начальный кадр.
  animationFillMode: 'both',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animationName: fade,
    },
  },
})
