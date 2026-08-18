import clsx from 'clsx'
import { useRef, useState, type FC, type ReactNode, type RefObject } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
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

/**
 * Едущий слой героя — вынесен из тела компонента, а не объявлен внутри него.
 *
 * Компонент, объявленный внутри рендера, — это новый тип на каждый рендер, а
 * значит размонтирование и монтирование всего поддерева заново. Здесь это
 * стоило бы дорого: у заголовка CSS-анимация выхода, она заиграла бы второй
 * раз — и ровно в тот момент, когда `isScrolled` переключается на первой
 * прокрутке.
 */
const HeroRiseMotion: FC<{
  sectionRef: RefObject<HTMLElement | null>
  strength: number
  className?: string
  children: ReactNode
}> = ({ sectionRef, strength, className, children }) => {
  const y = useParallaxOffset(sectionRef, strength)

  return (
    <motion.div className={className} style={{ y }}>
      {children}
    </motion.div>
  )
}

/**
 * Развилка слоя ухода. Отдельный компонент — по той же причине, что `SpotDrift`
 * в `DecorField`: условно позвать `useParallaxOffset` нельзя, а при
 * сокращённом движении его подписка на прокрутку работала бы вхолостую —
 * считала бы смещение, которое никуда не применяется. Ветвление по компоненту
 * делает выбор настоящим: в неподвижной ветке нет ни подписки, ни
 * motion-элемента.
 */
const HeroRise: FC<{
  isReduced: boolean
  sectionRef: RefObject<HTMLElement | null>
  strength: number
  className?: string
  children: ReactNode
}> = ({ isReduced, sectionRef, strength, className, children }) =>
  isReduced ? (
    <div className={className}>{children}</div>
  ) : (
    <HeroRiseMotion sectionRef={sectionRef} strength={strength} className={className}>
      {children}
    </HeroRiseMotion>
  )

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

  const isReduced = useReducedMotion() ?? false

  /*
    Эта подписка остаётся и при сокращённом движении: она не двигает ничего,
    а всего лишь один раз прячет подсказку «листайте ниже», когда листать уже
    начали. Уход героя — другое дело, он ниже разведён по веткам.
  */
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
          <HeroRise
            isReduced={isReduced}
            sectionRef={sectionRef}
            strength={HERO_RISE_TITLE}
            className={styles.top}
          >
            {/* h1 страницы: другого смыслового заголовка верхнего уровня на главной нет. */}
            <h1 className={styles.heading}>
              {lines.map((line, index) => (
                <span key={line} className={styles.lineMask}>
                  <span className={styles.line} style={{ animationDelay: heroDelay(1 + index) }}>
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
          </HeroRise>

          <HeroRise isReduced={isReduced} sectionRef={sectionRef} strength={HERO_RISE_BOTTOM}>
            {/*
              CSS-анимация выхода — на внутренней обёртке: снаружи transform
              занят слоем ухода, и `fill-mode: both` конца keyframes намертво
              перебил бы его.
            */}
            <div className={styles.bottom} style={{ animationDelay: heroDelay(bottomStep) }}>
              {actions !== undefined && <div className={styles.actions}>{actions}</div>}

              {aside !== undefined && <div className={styles.aside}>{aside}</div>}
            </div>
          </HeroRise>
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
