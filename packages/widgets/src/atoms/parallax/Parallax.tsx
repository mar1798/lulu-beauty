import clsx from 'clsx'
import { useRef, type FC, type RefObject } from 'react'
import { motion } from 'motion/react'
import type { IBasicStyling, IParallaxProps } from '../../types'
import { useParallaxOffset } from '../../hooks/useParallaxOffset'
import * as styles from './Parallax.css'

/**
 * Обёртка скролл-параллакса: содержимое едет от `+strength` к `−strength`
 * за проход секции-цели через вьюпорт. После ревизии 2 параллакс нужен не
 * только пятнам `DecorField` — сценам шагов, ленте брендов и CTA, — и без
 * общей обёртки формула разошлась бы по пяти местам.
 *
 * Смещение считает общий хук `useParallaxOffset`; при
 * `prefers-reduced-motion` он возвращает `undefined`, и обёртка не ставит
 * `style` вовсе — содержимое стоит на месте.
 */

/**
 * Умеренная амплитуда по умолчанию: заметно меньше пятен (`72`) — обёрнутый
 * контент, в отличие от фона, читают, и большой ход мешал бы этому.
 */
const DEFAULT_STRENGTH = 24

export const Parallax: FC<IParallaxProps & IBasicStyling> = ({
  children,
  strength = DEFAULT_STRENGTH,
  axis = 'y',
  containerRef,
  as = 'div',
  className,
}) => {
  const ownRef = useRef<HTMLElement | null>(null)
  const offset = useParallaxOffset(containerRef ?? ownRef, strength)

  const style =
    offset === undefined ? undefined : axis === 'x' ? { x: offset } : { y: offset }

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
