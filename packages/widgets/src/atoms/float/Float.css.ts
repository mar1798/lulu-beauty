import { keyframes, style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { SHOWCASE_FLOAT_OFFSET } from '../../utils/motion'

/**
 * Амплитуда левитации — литеральное CSS-свойство, а не `createVar()`.
 *
 * Значение задаётся инлайном на каждом элементе (у карточек витрины оно своё),
 * а для этого нужно голое имя переменной: `createVar()` отдаёт его уже
 * завёрнутым в `var(...)`, и развернуть обратно умеет только
 * `@vanilla-extract/dynamic`, которого в проекте нет. Переменную читает один
 * `Float` и никто больше, так что литерального имени достаточно.
 */
export const FLOAT_DISTANCE_PROPERTY = '--float-distance'

/**
 * Левитация переднего плана. Родня пятенной (`DecorField.css.ts`), но без
 * наклона и с меньшим ходом: здесь под слоем лежит читаемый текст и
 * кликабельная ссылка, а не приглушённая картинка — см. `SHOWCASE_FLOAT_OFFSET`.
 */
const floatKeyframes = keyframes({
  from: { transform: `translateY(calc(-1 * var(${FLOAT_DISTANCE_PROPERTY})))` },
  to: { transform: `translateY(var(${FLOAT_DISTANCE_PROPERTY}))` },
})

/**
 * Имя анимации наружу: раскладка, которой левитация мешает, гасит её по имени
 * (`HomeHero.css.ts` — в ленте на телефоне карточки обязаны стоять ровно).
 */
export const floatAnimation = floatKeyframes

/**
 * Период и отрицательная задержка приходят инлайном из `phase`, амплитуда —
 * из `distance`: в CSS этим числам взяться неоткуда, а без них соседи качаются
 * в такт и одинаково.
 *
 * Своей высоты у слоя нет намеренно, и это не мелочь. Здесь стоял
 * `height: 100%` — чтобы карточка тянулась на всю ячейку, — и он же ломал
 * выравнивание: флекс-элемент с **заданной** поперечной высотой не
 * растягивается, `align-items: stretch` применяется только к `height: auto`.
 * В ряду с названиями разной длины карточки из-за этого расходились по высоте.
 * Высота — дело раскладки: ряд говорит `stretch` (все по самой высокой) или
 * `flex-end` (каждая по содержимому, низы на одной линии), а слой не мешает.
 *
 * `will-change` здесь нет намеренно — по тому же правилу, что у пятен:
 * бесконечная CSS-анимация и так держит слой на композиторе, а лишняя
 * подсказка стоит текстуры в памяти GPU на каждую карточку.
 */
export const container = style({
  vars: { [FLOAT_DISTANCE_PROPERTY]: `${SHOWCASE_FLOAT_OFFSET}px` },
  animationName: floatKeyframes,
  animationTimingFunction: 'ease-in-out',
  animationDirection: 'alternate',
  animationIterationCount: 'infinite',
  ...media({ preferReducedMotion: { animation: 'none' } }),
})

/**
 * За кадром слой встаёт. Классом, а не инлайновым `animation-play-state`:
 * инлайн перебил бы `animation: none` из `prefers-reduced-motion`.
 */
export const paused = style({
  animationPlayState: 'paused',
})
