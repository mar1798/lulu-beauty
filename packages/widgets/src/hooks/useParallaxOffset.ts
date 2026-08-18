import type { RefObject } from 'react'
import { useScroll, useTransform, type MotionValue } from 'motion/react'

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
 * ⚠️ **При `prefers-reduced-motion` этот хук вызывать нельзя.**
 *
 * Раньше он проверял флаг сам и возвращал `undefined`, но проверка гасила
 * только результат: `useScroll` всё равно подписывался и продолжал мерить
 * геометрию — на главной это девять подписок, работающих вхолостую у
 * человека, который явно попросил систему поменьше двигаться. Убрать
 * подписку изнутри нельзя (правила хуков), а подсунуть `useScroll` пустой
 * `target` — значит получить в консоли «Target ref is defined but not
 * hydrated» на каждое пятно.
 *
 * Поэтому решение принимает вызывающий, до вызова: `Parallax` и `DecorField`
 * читают `useReducedMotion()` и просто не рендерят компонент, который сюда
 * заходит. Так при сокращённом движении не создаётся ни подписки, ни
 * motion-элемента.
 */
export const useParallaxOffset = (
  containerRef: RefObject<HTMLElement | null>,
  strength: number,
): MotionValue<number> => {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })

  return useTransform(scrollYProgress, [0, 1], [strength, -strength])
}
