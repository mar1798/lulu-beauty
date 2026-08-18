import clsx from 'clsx'
import { useRef, type FC, type RefObject } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { IBasicStyling, IParallaxProps } from '../../types'
import { useParallaxOffset } from '../../hooks/useParallaxOffset'
import * as styles from './Parallax.css'

/**
 * Обёртка скролл-параллакса: содержимое едет от `+strength` к `−strength`
 * за проход секции-цели через вьюпорт. После ревизии 2 параллакс нужен не
 * только пятнам `DecorField`, — сценам шагов, ленте брендов и CTA, — и без
 * общей обёртки формула разошлась бы по пяти местам.
 *
 * Смещение считает общий хук `useParallaxOffset`.
 */

/**
 * Умеренная амплитуда по умолчанию: заметно меньше пятен (`72`) — обёрнутый
 * контент, в отличие от фона, читают, и большой ход мешал бы этому.
 */
const DEFAULT_STRENGTH = 24

/**
 * Двигающаяся ветка — вынесена отдельным компонентом сознательно.
 *
 * Правила хуков не дают вызвать `useParallaxOffset` условно, а вызывать его
 * при сокращённом движении нельзя: подписка `useScroll` внутри продолжила бы
 * мерить геометрию ради смещения, которое всё равно не применяется. Разделив
 * на два компонента, мы получаем настоящее ветвление — при сокращённом
 * движении сюда просто не заходят, и ни подписки, ни motion-элемента не
 * появляется вовсе.
 */
const ParallaxMotion: FC<Omit<IParallaxProps, 'strength'> & IBasicStyling & { strength: number }> = ({
  children,
  strength,
  axis,
  containerRef,
  as,
  className,
}) => {
  const ownRef = useRef<HTMLElement | null>(null)
  const offset = useParallaxOffset(containerRef ?? ownRef, strength)
  const style = axis === 'x' ? { x: offset } : { y: offset }

  if (as === 'span') {
    return (
      <motion.span
        ref={ownRef as RefObject<HTMLSpanElement | null>}
        className={clsx(styles.container, className)}
        style={style}
      >
        {children}
      </motion.span>
    )
  }

  return (
    <motion.div
      ref={ownRef as RefObject<HTMLDivElement | null>}
      className={clsx(styles.container, className)}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export const Parallax: FC<IParallaxProps & IBasicStyling> = ({
  children,
  strength = DEFAULT_STRENGTH,
  axis = 'y',
  containerRef,
  as = 'div',
  className,
}) => {
  const isReduced = useReducedMotion() ?? false

  if (isReduced) {
    /* Тот же узел и тот же класс — меняется только то, что он никуда не едет. */
    const Tag = as

    return <Tag className={clsx(styles.container, className)}>{children}</Tag>
  }

  return (
    <ParallaxMotion
      strength={strength}
      axis={axis}
      containerRef={containerRef}
      as={as}
      className={className}
    >
      {children}
    </ParallaxMotion>
  )
}
