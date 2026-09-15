import clsx from 'clsx'
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  motion,
  motionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'
import type { IBasicStyling, IHomeHeroProps } from '../../types'
import { IconChevronDown } from '../../svg/icons'
import { Container } from '../../atoms/container'
import { useStillNode } from '../../hooks/useStillNode'
import {
  HERO_RISE_BOTTOM,
  HERO_RISE_SHOWCASE,
  HERO_RISE_TITLE,
  HERO_STAGGER_STEP_MS,
} from '../../utils/motion'
import * as styles from './HomeHero.css'

/**
 * Первый экран главной: витрина текущего сбора.
 *
 * Две колонки. Слева — метка состояния, крупная типографика, таймер до
 * закрытия, одно действие и мелкая приписка; справа — витрина товаров
 * (`showcase`). До ревизии 3 герой был одной колонкой со слоганом на пустом
 * холсте: в кадре не было ни товара, ни внятного «до когда», а таймер стоял
 * угловой врезкой и читался как аксессуар. Теперь оба — часть композиции.
 *
 * Про каталог виджету по-прежнему знать не положено: товары приходят готовыми
 * узлами в слот. Герой отвечает за их расположение (ряд на десктопе,
 * прокручиваемая лента на телефоне), но не за содержимое карточек — так
 * страница остаётся вольна обернуть каждую своим слоем (`Float`,
 * `WishlistButton`), а виджет остаётся data-free.
 *
 * Выход — CSS-анимации (см. `HomeHero.css.ts`): они играют с первой
 * отрисовки статической страницы, не дожидаясь гидратации. JS здесь занят
 * только тем, что без него невозможно: уходом первого экрана при прокрутке
 * и скрытием индикатора после первого скролла — и то и другое живёт в
 * отдельных компонентах, которые не рендерятся, когда не нужны.
 *
 * Уход — тремя слоями: заголовочный блок едет быстрее витрины, витрина —
 * быстрее нижней строки с кнопками. Разница скоростей и даёт ощущение, что
 * страница вылезает из-под героя. Затухания при прокрутке нет намеренно —
 * герой уходит только смещением и остаётся непрозрачным. Обработчиков события
 * `scroll` и чтений геометрии в кадре нет.
 */

/**
 * Прогресс ухода первого экрана: 0 — герой стоит нетронутым, 1 — он целиком
 * уехал под верхнюю кромку.
 *
 * Считается **один раз на весь герой** и раздаётся контекстом. Раньше каждый
 * из трёх едущих слоёв звал `useParallaxOffset` сам, а индикатор — свой
 * `useScroll`: четыре подписки на один и тот же элемент с одним и тем же
 * ответом, то есть четыре измерения геометрии секции на кадр прокрутки вместо
 * одного. Считает их Motion (rAF, без обработчиков `scroll`), но считает
 * честно каждую.
 *
 * Отсчёт — от `start start`, а не от `start end`, которым живёт общий
 * `useParallaxOffset`. Тот считает проход элемента через вьюпорт снизу вверх и
 * годится всему, что въезжает в кадр из-под нижней кромки; герой же стоит в
 * начале документа и ниоткуда не въезжает — его прогресс обязан начинаться
 * нулём при нулевой прокрутке.
 *
 * Разница не косметическая: при старом отсчёте сервер печатал в разметку
 * `transform: translateY(96px)` (значение прогресса `0`, до которого в
 * браузере прокрутка никогда не доходит), первый экран красился статикой на
 * 96px ниже места — вместе с CSS-лесенкой выхода, — и подскакивал на
 * гидратации. Теперь в нулевой точке смещение тоже нулевое, и серверная
 * разметка совпадает с тем, что человек видит.
 *
 * Значение по умолчанию нужно только типам: слои читают контекст лишь под
 * провайдером, а при сокращённом движении не рендерятся вовсе.
 */
const HeroScrollContext = createContext<MotionValue<number>>(motionValue(0))

/**
 * Провайдер прогресса — отдельным компонентом, чтобы при сокращённом движении
 * его можно было просто не рендерить: `useScroll` внутри иначе подписался бы и
 * продолжил мерить секцию ради значения, которое никто не применяет.
 *
 * Своего узла не даёт — разметка у подвижной и неподвижной веток героя
 * поэтому одинаковая, и гидратация проходит без расхождения.
 */
const HeroScrollProvider: FC<{
  sectionRef: RefObject<HTMLElement | null>
  children: ReactNode
}> = ({ sectionRef, children }) => {
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })

  return <HeroScrollContext.Provider value={scrollYProgress}>{children}</HeroScrollContext.Provider>
}

/**
 * Доля высоты героя, после которой индикатор прокрутки считается ненужным:
 * человек уже начал листать.
 */
const HINT_HIDE_PROGRESS = 0.04

/**
 * Сторож порога — узла не рисует, только ждёт первой прокрутки.
 *
 * Отдельным компонентом ровно затем, чтобы его можно было **снять**: решение
 * «человек начал листать» необратимо, а подписка, живущая в теле индикатора,
 * продолжала бы дёргать обработчик на каждом кадре прокрутки до конца жизни
 * страницы — ради значения, которое уже ничего не меняет. Размонтирование
 * уносит подписку с собой.
 */
const HeroHintWatcher: FC<{ onScrolled: () => void }> = ({ onScrolled }) => {
  const progress = useContext(HeroScrollContext)

  const handleChange = useCallback(
    (value: number): void => {
      if (value > HINT_HIDE_PROGRESS) {
        onScrolled()
      }
    },
    [onScrolled]
  )

  // Колбэк стабилен намеренно: `useMotionValueEvent` переподписывается на
  // каждый новый, а герой перерисовывается раз в секунду вместе с таймером.
  useMotionValueEvent(progress, 'change', handleChange)

  return null
}

/**
 * Индикатор «листайте ниже» — отдельным компонентом, а не куском героя.
 *
 * Состояние нужно только ему, а слот `scrollHint` задан не всегда: в теле
 * организма оно заводилось бы и тогда, когда рисовать нечего. Ветвление по
 * компоненту делает выбор настоящим — нет подсказки, нет и сторожа.
 */
const HeroScrollHintMotion: FC<{
  delay: string
  children: ReactNode
}> = ({ delay, children }) => {
  const [isScrolled, setScrolled] = useState(false)

  const handleScrolled = useCallback((): void => {
    setScrolled(true)
  }, [])

  return (
    <div
      className={clsx(styles.hint, isScrolled && styles.hintHidden)}
      style={{ animationDelay: delay }}
      aria-hidden={true}
    >
      {!isScrolled && <HeroHintWatcher onScrolled={handleScrolled} />}

      {children}
    </div>
  )
}

/**
 * Развилка индикатора — по той же причине, что у `HeroRise`: при сокращённом
 * движении подсказка скрыта медиазапросом, и сторож считал бы порог ради
 * класса, которого никто не увидит.
 *
 * Разметка у веток одинаковая: серверная (всегда подвижная, `useReducedMotion`
 * на сервере — `false`) печатает ровно тот же узел, что рисует неподвижная, —
 * сторож своего узла не даёт, а до первой прокрутки `hintHidden` не стоит.
 * Гидратация поэтому проходит без расхождения, а снимать инлайновые стили, как
 * `useStillNode`, здесь нечего — их нет.
 */
const HeroScrollHint: FC<{
  isReduced: boolean
  delay: string
  children: ReactNode
}> = ({ isReduced, delay, children }) =>
  isReduced ? (
    <div className={styles.hint} style={{ animationDelay: delay }} aria-hidden={true}>
      {children}
    </div>
  ) : (
    <HeroScrollHintMotion delay={delay}>{children}</HeroScrollHintMotion>
  )

/**
 * Едущий слой героя — вынесен из тела компонента, а не объявлен внутри него.
 *
 * Компонент, объявленный внутри рендера, — это новый тип на каждый рендер, а
 * значит размонтирование и монтирование всего поддерева заново. Здесь это
 * стоило бы дорого: у заголовка CSS-анимация выхода, она заиграла бы второй
 * раз — и ровно в тот момент, когда `isScrolled` переключается на первой
 * прокрутке. Витрине это стоило бы ещё и перезапуска левитации карточек.
 */
const HeroRiseMotion: FC<{
  strength: number
  className?: string
  children: ReactNode
}> = ({ strength, className, children }) => {
  const progress = useContext(HeroScrollContext)

  /*
    От нуля вверх, а не от `+strength` к `−strength`: слой стоит на своём
    месте, пока герой не тронут, и уезжает ровно на `strength` к тому моменту,
    когда первый экран закрыт целиком. Видимое движение то же, что было, но
    его начало теперь выражается нулём — и сервер печатает в разметку
    нетронутый слой, а не смещённый (см. `HeroScrollContext`).
  */
  const y = useTransform(progress, [0, 1], [0, -strength])

  return (
    <motion.div className={className} style={{ y }}>
      {children}
    </motion.div>
  )
}

/**
 * Развилка слоя ухода. Отдельный компонент — по той же причине, что `SpotDrift`
 * в `DecorField`: условно позвать `useTransform` нельзя, а при сокращённом
 * движении он считал бы смещение, которое никуда не применяется. Ветвление по
 * компоненту делает выбор настоящим: в неподвижной ветке нет ни пересчёта, ни
 * motion-элемента.
 */
const HeroRise: FC<{
  isReduced: boolean
  strength: number
  className?: string
  children: ReactNode
}> = ({ isReduced, strength, className, children }) => {
  const stillRef = useStillNode()

  return isReduced ? (
    /* Начальный кадр Motion, напечатанный сервером, снимается после гидратации. */
    <div ref={stillRef} className={className}>
      {children}
    </div>
  ) : (
    <HeroRiseMotion strength={strength} className={className}>
      {children}
    </HeroRiseMotion>
  )
}

export const HomeHero: FC<IHomeHeroProps & IBasicStyling> = ({
  title,
  description,
  badge,
  status,
  actions,
  note,
  showcase,
  showcaseMore,
  background,
  scrollHint,
  className,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null)

  const isReduced = useReducedMotion() ?? false

  const lines = Array.isArray(title) ? title : [title]

  /*
    Лесенка сверху вниз: метка → строки заголовка → описание → и последней
    ступенью сразу нижняя строка и витрина. Они выходят вместе намеренно:
    порознь композиция закрывалась бы двумя отдельными движениями, а это одно
    и то же «дно» кадра, только в разных колонках. Индикатор идёт после всего
    с запасом в пару ступеней — он не часть композиции, а подсказка.
  */
  const descriptionStep = 2 + lines.length
  const closingStep = descriptionStep + 1
  const hintStep = closingStep + 2

  /** Ступень лесенки → значение `animation-delay`. */
  const heroDelay = (step: number): string => `${step * HERO_STAGGER_STEP_MS}ms`

  /*
    Прогресс ухода считается один раз на весь герой и раздаётся контекстом —
    слои и сторож индикатора берут его оттуда. При сокращённом движении
    провайдера нет вовсе: подписка мерила бы секцию ради значения, которое
    никто не применяет. Своего узла он не даёт, поэтому разметка у обеих
    веток одинаковая.
  */
  const body = (
    <>
      {background !== undefined && <div className={styles.background}>{background}</div>}

      <Container className={styles.inner}>
        <div className={clsx(styles.content, showcase !== undefined && styles.contentSplit)}>
          <div className={styles.copy}>
            <HeroRise isReduced={isReduced} strength={HERO_RISE_TITLE} className={styles.top}>
              {badge !== undefined && (
                <div className={styles.badge} style={{ animationDelay: heroDelay(1) }}>
                  {badge}
                </div>
              )}

              {/* h1 страницы: другого смыслового заголовка верхнего уровня на главной нет. */}
              <h1 className={styles.heading}>
                {lines.map((line, index) => (
                  <span key={line} className={styles.lineMask}>
                    <span className={styles.line} style={{ animationDelay: heroDelay(2 + index) }}>
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

            <HeroRise isReduced={isReduced} strength={HERO_RISE_BOTTOM}>
              {/*
                CSS-анимация выхода — на внутренней обёртке: снаружи transform
                занят слоем ухода, и `fill-mode: both` конца keyframes намертво
                перебил бы его.
              */}
              <div className={styles.bottom} style={{ animationDelay: heroDelay(closingStep) }}>
                {status !== undefined && <div className={styles.status}>{status}</div>}

                {actions !== undefined && <div className={styles.actions}>{actions}</div>}

                {note !== undefined && <p className={styles.note}>{note}</p>}
              </div>
            </HeroRise>
          </div>

          {showcase !== undefined && (
            <HeroRise
              isReduced={isReduced}
              strength={HERO_RISE_SHOWCASE}
              className={styles.showcase}
            >
              {/* Внутренняя обёртка — по той же причине, что у `bottom`. */}
              <div
                className={styles.showcaseRow}
                style={{ animationDelay: heroDelay(closingStep) }}
              >
                {showcase}

                {/* Замыкает ленту; в кластере скрыт (см. `showcaseMore` в CSS). */}
                {showcaseMore !== undefined && (
                  <div className={styles.showcaseMore}>{showcaseMore}</div>
                )}
              </div>
            </HeroRise>
          )}
        </div>

        {scrollHint !== undefined && (
          <HeroScrollHint isReduced={isReduced} delay={heroDelay(hintStep)}>
            <span>{scrollHint}</span>

            <IconChevronDown className={styles.hintIcon} />
          </HeroScrollHint>
        )}
      </Container>
    </>
  )

  return (
    <section ref={sectionRef} className={clsx(styles.container, className)}>
      {isReduced ? body : <HeroScrollProvider sectionRef={sectionRef}>{body}</HeroScrollProvider>}
    </section>
  )
}
