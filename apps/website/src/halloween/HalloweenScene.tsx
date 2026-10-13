import clsx from 'clsx'
import React, { useEffect, useRef } from 'react'
import { levitate } from 'widgets/styling/levitate'
import { DECOR_FLOAT_DURATION_MS, floatTiming } from 'widgets/utils'
import { BatFlap } from './BatFlap'
import {
  HALLOWEEN_ASPECT,
  HALLOWEEN_ASSETS,
  HALLOWEEN_PAUSED_ATTRIBUTE as PAUSED_ATTRIBUTE,
  type IHalloweenAsset,
} from './config'
import { useHalloween } from './useHalloween'
import * as styles from './halloween.css'

/**
 * Номинальная ширина для атрибутов `<img>`: реальную задаёт CSS, а пара
 * `width`/`height` нужна только ради пропорции — браузер резервирует место
 * до загрузки файла.
 */
const NOMINAL_WIDTH = 100

interface IDecoProps {
  /** Картинка из `public/halloween` или `batFlap` — встроенная мышь с крыльями. */
  asset: IHalloweenAsset | 'batFlap'
  /** Класс места: координаты и ширина. */
  className?: string
  /**
   * Фаза левитации (0…1) — есть она, и картинка парит той же анимацией, что
   * баночки на главной. Соседей разводит по фазе, как `floatPhase` у пятен.
   */
  phase?: number
  /** Слой качания на нитке (паук). */
  isSwinging?: boolean
  /** Декор первого экрана: без `loading="lazy"`. */
  isEager?: boolean
}

let offscreenObserver: IntersectionObserver | null = null

/**
 * Один наблюдатель на весь декор: вне экрана (с запасом в 100px) элемент
 * получает `data-halloween-paused`, и его анимации стоят. Как у баночек на
 * главной (`DecorField`): бесконечная анимация иначе тикает, пока открыта
 * вкладка, даже у тыкв в подвале, которых никто не видит.
 */
const observeOffscreen = (element: Element): (() => void) => {
  if (typeof IntersectionObserver === 'undefined') {
    return () => undefined
  }

  offscreenObserver ??= new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        entry.target.toggleAttribute(PAUSED_ATTRIBUTE, !entry.isIntersecting)
      }
    },
    { rootMargin: '100px' }
  )
  offscreenObserver.observe(element)

  return () => offscreenObserver?.unobserve(element)
}

/**
 * Одна картинка декора. Обёртка держит положение, картинка — движение: у
 * левитации свой transform, и общий на двоих перетёр бы координаты.
 */
export const Deco: React.FC<IDecoProps> = ({
  asset,
  className,
  phase,
  isSwinging = false,
  isEager = false,
}) => {
  const ref = useRef<HTMLSpanElement | null>(null)
  const isAnimated = phase !== undefined || isSwinging || asset === 'batFlap'

  useEffect(() => {
    const element = ref.current

    return isAnimated && element !== null ? observeOffscreen(element) : undefined
  }, [isAnimated])

  const motionClassName = clsx(phase !== undefined && levitate, isSwinging && styles.swing)
  const motionStyle = phase === undefined ? undefined : floatTiming(DECOR_FLOAT_DURATION_MS, phase)

  return (
    <span ref={ref} className={clsx(styles.item, className)}>
      {asset === 'batFlap' ? (
        <BatFlap className={motionClassName} style={motionStyle} />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- SVG-декор из public: оптимизировать `next/image` здесь нечего */
        <img
          src={HALLOWEEN_ASSETS[asset]}
          alt=""
          width={NOMINAL_WIDTH}
          height={Math.round(NOMINAL_WIDTH / HALLOWEEN_ASPECT[asset])}
          loading={isEager ? undefined : 'lazy'}
          decoding="async"
          draggable={false}
          className={clsx(styles.image, motionClassName)}
          style={motionStyle}
        />
      )}
    </span>
  )
}

export type IHalloweenSceneVariant =
  | 'home-hero'
  | 'home-steps'
  | 'catalog-title'
  | 'catalog-sides'
  | 'catalog-banner'
  | 'catalog-pagination'
  | 'product'
  | 'empty-state'
  | 'list-title'
  | 'auth'
  | 'footer'

/** Что парит над пустым состоянием — у каждого раздела своё. */
export type IHalloweenEmptyKind = 'catalog' | 'wishlist' | 'cart' | 'orders'

export interface IHalloweenSceneProps {
  variant: IHalloweenSceneVariant
  /** Только для `empty-state`. */
  kind?: IHalloweenEmptyKind
}

const renderScene = ({ variant, kind = 'orders' }: IHalloweenSceneProps): React.ReactNode => {
  switch (variant) {
    case 'home-hero':
      return (
        <div className={styles.homeHero}>
          <Deco asset="spider" className={styles.homeSpider} isSwinging={true} isEager={true} />
          <Deco asset="ghost" className={styles.homeGhost} phase={0.3} isEager={true} />
          <Deco asset="pumpkinFace" className={styles.homePumpkinFace} isEager={true} />
          <Deco asset="pumpkin" className={styles.homePumpkin} isEager={true} />
          <Deco asset="candlesTrio" className={styles.homeCandles} phase={0.7} isEager={true} />
        </div>
      )

    case 'home-steps':
      return <Deco asset="bats" className={styles.homeStepsBats} phase={0.5} />

    case 'catalog-title':
      /*
        Двигаются здесь только призрак и паук: вместе со свечой в баннере это
        три анимации на первом экране, больше глаз уже не разводит.
      */
      return (
        <>
          <div className={styles.catalogTitle}>
            <Deco asset="ghost" className={styles.catalogGhost} phase={0.15} isEager={true} />
          </div>

          <div className={styles.spiderWindow}>
            <span className={styles.spiderDrop}>
              <Deco asset="spider" className={styles.inRow} isSwinging={true} isEager={true} />
            </span>
          </div>
        </>
      )

    case 'catalog-sides':
      /*
        По бокам сетки, поочерёдно слева и справа, по всей её высоте. Вне
        экрана всё стоит (`Deco`), так что одновременно двигаются три-четыре.
      */
      return (
        <div className={styles.catalogSides}>
          <Deco asset="candlesTrio" className={styles.sideLeft1} phase={0.2} />
          <Deco asset="ghost" className={styles.sideRight1} phase={0.5} />
          <Deco asset="bats" className={clsx(styles.sideLeft2, styles.sideExtra)} phase={0.8} />
          <Deco asset="candle" className={clsx(styles.sideRight2, styles.sideExtra)} phase={0.3} />
          <Deco asset="pumpkinFace" className={styles.sideLeft3} phase={0.35} />
          <Deco asset="bat" className={styles.sideRight3} phase={0.7} />
          <Deco asset="ghost" className={clsx(styles.sideLeft4, styles.sideExtra)} phase={0.05} />
          <Deco
            asset="candlesTrio"
            className={clsx(styles.sideRight4, styles.sideExtra)}
            phase={0.6}
          />
          <Deco asset="candle" className={styles.sideLeft5} phase={0.1} />
          <Deco asset="pumpkin" className={styles.sideRight5} phase={0.85} />
        </div>
      )

    case 'catalog-banner':
      return <Deco asset="candle" className={styles.bannerCandle} phase={0.55} isEager={true} />

    case 'catalog-pagination':
      return (
        <>
          <Deco asset="pumpkinFace" className={styles.paginationPumpkin} />
          <Deco asset="bats" className={styles.paginationBats} phase={0.4} />
        </>
      )

    case 'product':
      return <Deco asset="batFlap" className={styles.productBat} phase={0.6} isEager={true} />

    case 'empty-state':
      if (kind === 'catalog') {
        return <Deco asset="ghost" className={styles.catalogEmptyGhost} phase={0.25} />
      }

      return (
        <div className={styles.emptyScene}>
          {kind === 'wishlist' && (
            <Deco asset="ghost" className={clsx(styles.inRow, styles.emptyGhost)} phase={0.2} />
          )}

          {kind === 'cart' && (
            <>
              <Deco asset="pumpkinFace" className={clsx(styles.inRow, styles.emptyPumpkinFace)} />
              <Deco
                asset="candlesTrio"
                className={clsx(styles.inRow, styles.emptyCandles)}
                phase={0.6}
              />
            </>
          )}

          {kind === 'orders' && (
            <Deco asset="bats" className={clsx(styles.inRow, styles.emptyBats)} phase={0.35} />
          )}
        </div>
      )

    case 'auth':
      return <Deco asset="bats" className={styles.authBats} phase={0.35} isEager={true} />

    case 'list-title':
      return (
        <div className={styles.listTitle}>
          <Deco asset="bats" className={clsx(styles.inRow, styles.listBats)} phase={0.45} />
          <Deco asset="pumpkin" className={clsx(styles.inRow, styles.listPumpkin)} />
        </div>
      )

    case 'footer':
      return (
        <div className={styles.footer}>
          <div className={styles.footerRow}>
            <Deco asset="candlesTrio" className={clsx(styles.inRow, styles.footerCandles)} />
            <Deco asset="pumpkinFace" className={clsx(styles.inRow, styles.footerPumpkinFace)} />
            <Deco asset="pumpkin" className={clsx(styles.inRow, styles.footerPumpkin)} />
          </div>
        </div>
      )
  }
}

/**
 * Точечная сцена хэллоуинского декора внутри конкретного блока страницы.
 *
 * Позиционируется `absolute` относительно ближайшего позиционированного
 * предка — его страница помечает классом `halloweenHost` (или блок уже
 * позиционирован сам). Места в потоке сцена не занимает, поэтому её появление
 * после гидрации ничего не сдвигает. Вне сезона — `null`.
 */
export const HalloweenScene: React.FC<IHalloweenSceneProps> = props => {
  const isActive = useHalloween()

  if (!isActive) {
    return null
  }

  return (
    <div aria-hidden={true} style={{ display: 'contents' }}>
      {renderScene(props)}
    </div>
  )
}

/**
 * Пустое состояние с хэллоуинским декором над заголовком. Обёртка — точка
 * отсчёта для сцены и сама по себе ничего не меняет: вне сезона внутри неё
 * остаётся только пустое состояние.
 */
export const HalloweenEmpty: React.FC<{ kind: IHalloweenEmptyKind; children: React.ReactNode }> = ({
  kind,
  children,
}) => (
  <div className={styles.host}>
    <HalloweenScene variant="empty-state" kind={kind} />
    {children}
  </div>
)
