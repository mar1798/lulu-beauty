import type { RefObject } from 'react'
import { useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'

/**
 * Смещение скролл-параллакса: элемент едет от `+strength` к `−strength` за
 * проход секции через вьюпорт.
 *
 * Единственное место в репозитории, где `useScroll`/`useTransform` зовутся
 * ради параллакса: пятна `DecorField`, обёртка `Parallax` и уход героя берут
 * смещение отсюда — вторая реализация разошлась бы с этой при первой правке.
 * Внутри — rAF и composited transform, никаких обработчиков события `scroll`
 * и чтений геометрии в кадре.
 *
 * При `prefers-reduced-motion` возвращается `undefined`: вызывающий не
 * ставит `style` вовсе, и элемент стоит на месте.
 */
export const useParallaxOffset = (
  containerRef: RefObject<HTMLElement | null>,
  strength: number,
): MotionValue<number> | undefined => {
  const isReduced = useReducedMotion() ?? false

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })

  const offset = useTransform(scrollYProgress, [0, 1], [strength, -strength])

  return isReduced ? undefined : offset
}
