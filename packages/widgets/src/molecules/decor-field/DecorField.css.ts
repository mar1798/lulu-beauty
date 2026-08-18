import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { color } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { vars } from '../../styling/themes/contract.css'
import { DECOR_FLOAT_OFFSET } from '../../utils/motion'

/**
 * Слой пятен занимает всю секцию и не ловит события: он строго за контентом.
 * `overflow: hidden` здесь не нужен — его держит секция (`HomeSection`),
 * иначе уехавшее по параллаксу пятно дало бы горизонтальную прокрутку.
 */
export const container = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
})

/**
 * Статическая привязка пятна: край и ширина ступенью, центр — в `top`.
 * Свой transform занят центрированием, поэтому движущиеся слои живут на
 * вложенных элементах — общий transform молча перетёр бы соседний слой.
 */
export const anchor = style({
  position: 'absolute',
  transform: 'translateY(-50%)',
})

export const size = styleVariants({
  sm: { width: vars.decor.sizeSm },
  md: { width: vars.decor.sizeMd },
  lg: { width: vars.decor.sizeLg },
})

/** Слой скролл-параллакса — transform ставит motion. */
export const drift = style({})

/**
 * Левитация баночки: дыхание по вертикали с микро-наклоном. Период и
 * отрицательная задержка приходят инлайном из `floatPhase` — соседние пятна
 * не должны качаться в такт, а в CSS этим числам взяться неоткуда.
 */
const floatKeyframes = keyframes({
  from: { transform: `translateY(${-DECOR_FLOAT_OFFSET}px) rotate(-1.2deg)` },
  to: { transform: `translateY(${DECOR_FLOAT_OFFSET}px) rotate(1.2deg)` },
})

export const float = style({
  /*
    `relative` не ради координат, а ради порядка отрисовки: без него
    непозиционированная баночка ушла бы под абсолютный ореол.
  */
  position: 'relative',
  animationName: floatKeyframes,
  animationTimingFunction: 'ease-in-out',
  animationDirection: 'alternate',
  animationIterationCount: 'infinite',
  ...media({ preferReducedMotion: { animation: 'none' } }),
})

/**
 * Слой скролл-параллакса едет от каждого кадра прокрутки, а не по собственной
 * анимации — его composited-слой держим руками. Класс отдельный, потому что
 * `will-change` не бесплатен: при `prefers-reduced-motion` слой стоит
 * намертво, и промотировать его не за чем (JS тогда класс не ставит).
 *
 * На `.float` его нет по той же причине, что и на ореоле: у обоих собственная
 * бесконечная CSS-анимация, браузер и так держит их на слое, а лишний
 * `will-change` — это ещё одна текстура в памяти GPU на каждое пятно
 * (аудит MotionScore ловит их как «stale will-change»).
 */
export const moving = style({
  willChange: 'transform',
})

/**
 * Пятно за кадром: левитация и дрейф ореола встают. Классом, а не инлайном, —
 * инлайновый `animation-play-state` перебил бы `animation: none` из
 * `prefers-reduced-motion`.
 */
export const paused = style({
  animationPlayState: 'paused',
})

/**
 * Пастельный ореол — то самое «пятно», которому, в отличие от товара,
 * можно обрезаться о край секции. Радиальный градиент без `blur()`:
 * градиент и так мягкий, а размытие большой площади — самый дорогой эффект,
 * который можно поставить рядом со скроллом. Дрейф встречный и заметно
 * медленнее левитации: расхождение частот и читается как глубина.
 * `will-change` ореолу не нужен: собственная бесконечная CSS-анимация и так
 * держит его на слое.
 */
const haloKeyframes = keyframes({
  from: { transform: `translate(-50%, -50%) translateY(${DECOR_FLOAT_OFFSET}px)` },
  to: { transform: `translate(-50%, -50%) translateY(${-DECOR_FLOAT_OFFSET}px)` },
})

export const halo = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '190%',
  aspectRatio: '1',
  borderRadius: vars.radius.circle,
  transform: 'translate(-50%, -50%)',
  animationName: haloKeyframes,
  animationTimingFunction: 'ease-in-out',
  animationDirection: 'alternate',
  animationIterationCount: 'infinite',
  ...media({ preferReducedMotion: { animation: 'none' } }),
})

export const haloTone = styleVariants({
  brand: {
    background: `radial-gradient(closest-side, ${color.brand('300', vars.opacity.halo)}, transparent 70%)`,
  },
  accent: {
    background: `radial-gradient(closest-side, ${color.accent('200', vars.opacity.halo)}, transparent 70%)`,
  },
})

export const image = style({
  display: 'block',
  width: '100%',
  height: 'auto',
  opacity: vars.opacity.decor,
})

export const strong = style({
  opacity: vars.opacity.decorStrong,
})

/** Зеркалим картинкой, а не обёрткой: transform обёрток занят движением. */
export const flipped = style({
  transform: 'scaleX(-1)',
})
