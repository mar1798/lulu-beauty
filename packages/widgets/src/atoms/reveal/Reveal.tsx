import clsx from 'clsx'
import { type FC } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import type { IBasicStyling, IRevealProps } from '../../types'
import { REVEAL_OFFSET, REVEAL_TRANSITION } from '../../utils/motion'
import * as styles from './Reveal.css'

/**
 * Появление блока по входу в вьюпорт — единый кирпич всех секций главной.
 * Без него каждая секция повторила бы один и тот же motion-код, и тайминги
 * разошлись бы при первой правке.
 *
 * Существующий `Appear` не заменяет: тот на CSS и играет по монтированию
 * (подмена скелетона), а здесь вход по вьюпорту. Разные задачи.
 *
 * `once: true` обязателен — без него анимация переигрывала бы на каждой
 * прокрутке вверх-вниз и превращалась в мигание.
 *
 * Лесенка внутри списка собирается снаружи — `delay={staggerDelay(index)}` на
 * каждом элементе (так делают `CategoryTiles`, `StepList`, `FaqAccordion`,
 * подборка на главной). Оркестровку через `staggerChildren` не заводим:
 * второй механизм лесенки рядом с этим разошёлся бы с ним при первой правке.
 *
 * При `prefers-reduced-motion` содержимое видно сразу и целиком: анимация
 * не подключается вовсе, а не «играет быстрее».
 */

const DEFAULT_AMOUNT = 0.2

const TAGS = {
  div: motion.div,
  li: motion.li,
  span: motion.span,
} as const

export const Reveal: FC<IRevealProps & IBasicStyling> = ({
  children,
  as = 'div',
  delay = 0,
  amount = DEFAULT_AMOUNT,
  className,
}) => {
  const isReduced = useReducedMotion() ?? false
  const Tag = TAGS[as]

  const variants: Variants = {
    hidden: { opacity: 0, y: REVEAL_OFFSET },
    visible: {
      opacity: 1,
      y: 0,
      transition: { ...REVEAL_TRANSITION, delay },
    },
  }

  if (isReduced) {
    /*
      Движения нет, но конечное состояние выставить обязательно — и не только
      своё. Сервер всегда рисует motion-ветку (`useReducedMotion` там `false`),
      поэтому в разметке уже лежит `opacity:0;transform:translateY(24px)`, а
      гидратация чужой атрибут не трогает: без этого секция оставалась бы
      невидимой навсегда. Детали мини-сцен внутри (`StepScene`) своих `initial`
      не имеют вовсе — они берут вариант от этой обёртки, и без неё застревали
      бы в `hidden` тем же образом.

      Поэтому здесь тот же motion-узел с тем же набором вариантов, но
      `initial={false}`: motion встаёт сразу в `visible` — и себе, и потомкам, —
      не проигрывая перехода. Подписки на вьюпорт при этом не появляется:
      `whileInView` в этой ветке нет.
    */
    return (
      <Tag
        className={clsx(styles.container, className)}
        variants={variants}
        initial={false}
        animate="visible"
      >
        {children}
      </Tag>
    )
  }

  return (
    <Tag
      className={clsx(styles.container, className)}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
    >
      {children}
    </Tag>
  )
}
