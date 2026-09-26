import clsx from 'clsx'
import { type FC, useLayoutEffect, useRef, useState } from 'react'
import { m, useInView, useReducedMotion, type Variants } from 'motion/react'
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
 *
 * С сервера блок приходит **видимым**. Раньше в разметке лежал
 * `opacity:0` от `initial="hidden"`, и на медленном телефоне всё ниже героя
 * пустовало до гидрации, а при сбое загрузки чанка так пустым и оставалось.
 * Теперь прячется блок уже в браузере, до первой отрисовки после гидрации
 * (в кадре после `useLayoutEffect` — см. там), и только если он ниже экрана:
 * тот, что уже на экране, остаётся как есть — мигнуть «видно → пропало →
 * появилось» было бы хуже, чем обойтись без появления.
 */

const DEFAULT_AMOUNT = 0.2

const TAGS = {
  div: m.div,
  li: m.li,
  span: m.span,
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
  const ref = useRef<HTMLElement>(null)
  /** Спрятан ли блок в ожидании входа в вьюпорт — только в браузере, см. выше. */
  const [isArmed, setIsArmed] = useState(false)
  const isInView = useInView(ref, { once: true, amount })

  useLayoutEffect(() => {
    if (isReduced) {
      return
    }

    /*
      Мерить — в следующем кадре, а не прямо здесь. Прокрутку при «назад»
      (`scrollRestoration`) и сброс наверх при переходе Next выставляет в своём
      layout-эффекте корня, а тот срабатывает после эффектов детей: замер здесь
      видел страницу ещё в самом верху, и блоки, которые после восстановления
      стоят на экране, прятались и появлялись заново. `requestAnimationFrame`
      выполняется уже после прокрутки, но до первой отрисовки.
    */
    const frame = window.requestAnimationFrame(() => {
      const node = ref.current

      if (node === null) {
        return
      }

      const rect = node.getBoundingClientRect()
      const isOnScreen = rect.top < window.innerHeight && rect.bottom > 0

      if (!isOnScreen) {
        setIsArmed(true)
      }
    })

    return () => window.cancelAnimationFrame(frame)
    // Только на монтировании: решение «прятать или нет» принимается один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const variants: Variants = {
    // Прячется мгновенно: блок в этот момент за экраном, и видеть это некому.
    hidden: { opacity: 0, y: REVEAL_OFFSET, transition: { duration: 0 } },
    visible: {
      opacity: 1,
      y: 0,
      transition: { ...REVEAL_TRANSITION, delay },
    },
  }

  /*
    `initial={false}` — и на сервере, и на первой отрисовке в браузере узел
    стоит в `visible`: так в разметку не попадает `opacity:0`. Детали мини-сцен
    внутри (`StepScene`) своих `initial` не имеют — они берут вариант от этой
    обёртки и следуют за ним и в `hidden`, и обратно.
  */
  return (
    <Tag
      ref={ref as never}
      className={clsx(styles.container, className)}
      variants={variants}
      initial={false}
      animate={isArmed && !isInView ? 'hidden' : 'visible'}
    >
      {children}
    </Tag>
  )
}
