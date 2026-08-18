import clsx from 'clsx'
import { useRef, type CSSProperties, type FC, type ReactNode, type RefObject } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import type { IBasicStyling, IDecorFieldProps, IDecorSpot } from '../../types'
import { AppImage } from '../../atoms/app-image'
import { useParallaxOffset } from '../../hooks/useParallaxOffset'
import {
  DECOR_FLOAT_DURATION_MS,
  DECOR_PARALLAX_PX,
  HALO_FLOAT_DURATION_MS,
} from '../../utils/motion'
import * as styles from './DecorField.css'

/**
 * Поле фоновых декоративных PNG — общий кирпич героя, «категорий»,
 * «как это работает» и CTA.
 *
 * Пятна — атмосфера, а не товар: всегда `aria-hidden`, некликабельны,
 * приглушены токенами `opacity.decor*`. Но атмосфера — не обрезки: баночка
 * видна целиком, за край уходит только ореол. Поэтому размер — только
 * ступень `decor.size*` с потолком в px, горизонталь — положительный отступ
 * от края, а вертикаль — центр пятна, не его верх.
 *
 * Пятно двигают три независимых слоя, каждый на своём вложенном элементе со
 * своим transform (общий transform молча перетёр бы соседа): медленный
 * скролл-параллакс (`useParallaxOffset`), непрерывная CSS-левитация баночки
 * и встречный дрейф ореола. Расхождение их частот и читается как глубина.
 */

/**
 * Потолок ступени в px — он же реальный отрисованный размер пятна для
 * оптимизатора картинок: `100vw` заставил бы его отдавать полный файл.
 */
const SIZE_CEILING = { sm: '148px', md: '196px', lg: '248px' } as const

/**
 * Период левитации конкретного пятна: базовый ±15 % от `floatPhase`, чтобы
 * соседние пятна расходились не только стартовой точкой, но и частотой.
 * Задержка отрицательная — анимация начинается с середины цикла, а не с
 * синхронного нуля.
 */
const floatTiming = (baseMs: number, phase: number): CSSProperties => {
  const duration = baseMs * (0.85 + 0.3 * phase)

  return { animationDuration: `${duration}ms`, animationDelay: `${-phase * duration}ms` }
}

/**
 * Едущий слой пятна — отдельным компонентом, чтобы `useParallaxOffset`
 * вызывался только тогда, когда параллакс вообще нужен.
 *
 * Условно позвать хук правила React не дают, а звать его при сокращённом
 * движении незачем: `useScroll` внутри подписался бы и продолжил мерить
 * геометрию ради смещения, которое всё равно не применяется. На главной пятен
 * семь — это семь холостых подписок у человека, попросившего систему поменьше
 * двигаться. Ветвление по компоненту решает это честно.
 */
const SpotDrift: FC<{
  containerRef: RefObject<HTMLElement | null>
  depth: number
  isActive: boolean
  children: ReactNode
}> = ({ containerRef, depth, isActive, children }) => {
  const y = useParallaxOffset(containerRef, DECOR_PARALLAX_PX * depth)

  return (
    <motion.div className={clsx(styles.drift, isActive && styles.moving)} style={{ y }}>
      {children}
    </motion.div>
  )
}

const Spot: FC<{
  spot: IDecorSpot
  containerRef: RefObject<HTMLElement | null>
  isActive: boolean
  isReduced: boolean
}> = ({ spot, containerRef, isActive, isReduced }) => {
  const phase = spot.floatPhase ?? 0
  const halo = spot.halo ?? 'brand'

  const layers = (
    <>
      {halo !== 'none' && (
        /* Тайминги дрейфа — от floatPhase, см. floatTiming. */
        <span
          className={clsx(styles.halo, styles.haloTone[halo], !isActive && styles.paused)}
          style={floatTiming(HALO_FLOAT_DURATION_MS, phase)}
        />
      )}

      <div
        className={clsx(styles.float, !isActive && styles.paused)}
        style={floatTiming(DECOR_FLOAT_DURATION_MS, phase)}
      >
        <AppImage
          className={clsx(
            styles.image,
            spot.isStrong === true && styles.strong,
            spot.isFlipped === true && styles.flipped,
          )}
          image={spot.image}
          sizes={{ fb: SIZE_CEILING[spot.size] }}
          priority={spot.isPriority}
        />
      </div>
    </>
  )

  return (
    <div
      className={clsx(styles.anchor, styles.size[spot.size])}
      /* Позиция — данные конкретного пятна, в CSS ей взяться неоткуда. */
      style={{ top: spot.top, [spot.side]: spot.offsetX }}
    >
      {isReduced ? (
        /*
          Тот же слой, но обычным блоком: `will-change` не ставим — промотировать
          неподвижный слой не за чем (та же логика, что у класса `moving`).
        */
        <div className={styles.drift}>{layers}</div>
      ) : (
        <SpotDrift containerRef={containerRef} depth={spot.depth} isActive={isActive}>
          {layers}
        </SpotDrift>
      )}
    </div>
  )
}

/**
 * Запас, на который поле «оживает» до появления в кадре: слой успевает
 * промотироваться и раскачаться, пока секция ещё за краем экрана, — иначе
 * человек увидел бы момент старта левитации.
 */
const ACTIVATION_MARGIN = '200px'

export const DecorField: FC<IDecorFieldProps & IBasicStyling> = ({
  spots,
  containerRef,
  className,
}) => {
  const fieldRef = useRef<HTMLDivElement | null>(null)

  /*
    За кадром пятна стоят — тем же правилом, что лента брендов и индикатор
    прокрутки героя: четыре бесконечные CSS-анимации на секцию иначе тикали бы
    в композиторе всё время, что открыта вкладка, во всех четырёх секциях
    сразу. `will-change` снимается заодно — промотировать неподвижный слой
    незачем.

    Наблюдаем за собственным корнем, а не за `containerRef`: поле лежит
    `inset: 0` в секции, то есть геометрически это она же, зато свой ref
    гарантированно проставлен к моменту эффекта. Секция приходит пропсом со
    страницы, и её ref к этому моменту может быть ещё пуст — наблюдатель
    тогда не завёлся бы вовсе, и пятна замерли бы навсегда.
  */
  const isActive = useInView(fieldRef, { margin: ACTIVATION_MARGIN })

  /* Флаг читается здесь, один раз на поле, и раздаётся пятнам пропсом. */
  const isReduced = useReducedMotion() ?? false

  return (
    <div ref={fieldRef} className={clsx(styles.container, className)} aria-hidden={true}>
      {spots.map(spot => (
        <Spot
          key={`${String(spot.image.src)}-${spot.top}-${spot.side}`}
          spot={spot}
          containerRef={containerRef}
          isActive={isActive}
          isReduced={isReduced}
        />
      ))}
    </div>
  )
}
