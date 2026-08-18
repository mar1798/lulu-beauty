import clsx from 'clsx'
import { useRef, useState, type FC } from 'react'
import { motion, useMotionValueEvent, useScroll } from 'motion/react'
import type { IBasicStyling, IHomeHeroProps } from '../../types'
import { IconChevronDown } from '../../svg/icons'
import { Container } from '../../atoms/container'
import { useParallaxOffset } from '../../hooks/useParallaxOffset'
import { HERO_RISE_BOTTOM, HERO_RISE_TITLE, HERO_STAGGER_STEP_MS } from '../../utils/motion'
import * as styles from './HomeHero.css'

/**
 * Полноэкранный первый экран главной: крупная типографика, панель состояния
 * сбора и оркестрованный выход при загрузке.
 *
 * Выход — CSS-анимации (см. `HomeHero.css.ts`): они играют с первой
 * отрисовки статической страницы, не дожидаясь гидратации. JS здесь занят
 * только тем, что без него невозможно: уходом первого экрана при прокрутке
 * и скрытием индикатора после первого скролла.
 *
 * Уход — двумя слоями: заголовочный блок едет быстрее нижней строки с
 * кнопками и панелью. Разница скоростей и даёт ощущение, что страница
 * вылезает из-под героя; смещения считает общий `useParallaxOffset`.
 * Затухания при прокрутке нет намеренно — герой уходит только смещением и
 * остаётся непрозрачным. Обработчиков события `scroll` и чтений геометрии
 * в кадре нет.
 *
 * Состояние сбора живёт только в слоте `aside` — `StatusPanel` с таймером
 * или с «сбора нет» выбирает страница: активный цикл она берёт из API, а
 * виджету про запросы знать не положено. Своего надзаголовка у героя нет
 * намеренно: он дублировал бы ту же панель. Своей типографики у слота тоже
 * нет — панель держится сменой материала, а не кеглем, и набирает цифры
 * сама.
 */

/**
 * Доля высоты героя, после которой индикатор прокрутки считается ненужным:
 * человек уже начал листать.
 */
const HINT_HIDE_PROGRESS = 0.04

export const HomeHero: FC<IHomeHeroProps & IBasicStyling> = ({
  title,
  description,
  actions,
  aside,
  background,
  scrollHint,
  className,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [isScrolled, setScrolled] = useState(false)

  const titleY = useParallaxOffset(sectionRef, HERO_RISE_TITLE)
  const bottomY = useParallaxOffset(sectionRef, HERO_RISE_BOTTOM)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })

  useMotionValueEvent(scrollYProgress, 'change', progress => {
    // `setState` — один раз при пересечении порога, а не на каждый кадр.
    if (!isScrolled && progress > HINT_HIDE_PROGRESS) {
      setScrolled(true)
    }
  })

  const lines = Array.isArray(title) ? title : [title]

  /*
    Лесенка сверху вниз: строки → описание → кнопки с панелью. Индикатор
    идёт после всего с запасом в пару ступеней — он не часть композиции, а
    подсказка.
  */
  const descriptionStep = 1 + lines.length
  const bottomStep = descriptionStep + 1
  const hintStep = bottomStep + 2

  /** Ступень лесенки → значение `animation-delay`. */
  const heroDelay = (step: number): string => `${step * HERO_STAGGER_STEP_MS}ms`

  return (
    <section ref={sectionRef} className={clsx(styles.container, className)}>
      {background !== undefined && <div className={styles.background}>{background}</div>}

      <Container className={styles.inner}>
        <div className={styles.content}>
          <motion.div
            className={styles.top}
            style={titleY === undefined ? undefined : { y: titleY }}
          >
            {/* h1 страницы: другого смыслового заголовка верхнего уровня на главной нет. */}
            <h1 className={styles.heading}>
              {lines.map((line, index) => (
                <span key={line} className={styles.lineMask}>
                  <span
                    className={styles.line}
                    style={{ animationDelay: heroDelay(1 + index) }}
                  >
                    {line}
                  </span>
                </span>
              ))}
            </h1>

            {description !== undefined && (
              <p
                className={styles.description}
                style={{ animationDelay: heroDelay(descriptionStep) }}
              >
                {description}
              </p>
            )}
          </motion.div>

          <motion.div style={bottomY === undefined ? undefined : { y: bottomY }}>
            {/*
              CSS-анимация выхода — на внутренней обёртке: снаружи transform
              занят слоем ухода, и `fill-mode: both` конца keyframes намертво
              перебил бы его.
            */}
            <div className={styles.bottom} style={{ animationDelay: heroDelay(bottomStep) }}>
              {actions !== undefined && <div className={styles.actions}>{actions}</div>}

              {aside !== undefined && <div className={styles.aside}>{aside}</div>}
            </div>
          </motion.div>
        </div>

        {scrollHint !== undefined && (
          <div
            className={clsx(styles.hint, isScrolled && styles.hintHidden)}
            style={{ animationDelay: heroDelay(hintStep) }}
            aria-hidden={true}
          >
            <span>{scrollHint}</span>

            <IconChevronDown className={styles.hintIcon} />
          </div>
        )}
      </Container>
    </section>
  )
}
