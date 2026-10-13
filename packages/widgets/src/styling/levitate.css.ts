import { keyframes, style } from '@vanilla-extract/css'
import { media } from './lib/media'
import { DECOR_FLOAT_OFFSET } from '../utils/motion'

/**
 * Левитация фоновой баночки: дыхание по вертикали с микро-наклоном.
 *
 * Вынесена из `DecorField` отдельным модулем, чтобы так же парило и то, что
 * сайт ставит поверх витрины сезонно (призраки и свечи на Хэллоуин), — одной
 * анимацией, а не похожей копией: две почти одинаковые кривые рядом читаются
 * как разнобой.
 *
 * Период и отрицательная задержка в класс не входят: их приносит инлайном
 * `floatTiming` (`utils/motion.ts`) — соседи не должны качаться в такт, а в
 * CSS этим числам взяться неоткуда.
 *
 * Свой transform класс занимает целиком, поэтому вешать его надо на
 * отдельный слой — общий transform молча перетёр бы соседний.
 */
const levitateKeyframes = keyframes({
  from: { transform: `translateY(${-DECOR_FLOAT_OFFSET}px) rotate(-1.2deg)` },
  to: { transform: `translateY(${DECOR_FLOAT_OFFSET}px) rotate(1.2deg)` },
})

export const levitate = style({
  animationName: levitateKeyframes,
  animationTimingFunction: 'ease-in-out',
  animationDirection: 'alternate',
  animationIterationCount: 'infinite',
  ...media({ preferReducedMotion: { animation: 'none' } }),
})
