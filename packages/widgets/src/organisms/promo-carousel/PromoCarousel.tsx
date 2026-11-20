import clsx from 'clsx'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { m, useInView, useReducedMotion } from 'motion/react'
import type { IBasicStyling, IPromoCarouselProps } from '../../types'
import { breakpoints } from '../../breakpoints'
import { IconPause, IconPlay } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import {
  PROMO_CAROUSEL_INTERVAL_MS,
  PROMO_DOT_ACTIVE_SCALE,
  PROMO_DOT_TRANSITION,
} from '../../utils/motion'
import { BANNER_SPECS } from '../../utils/promotion'
import * as styles from './PromoCarousel.css'

/**
 * Карусель акций над каталогом: один баннер на слайд, слайд во всю ширину.
 *
 * Листает не скрипт, а сам браузер: слайды лежат в ряду с `scroll-snap`, поэтому
 * свайп на телефоне нативный (инерция, остановка ровно на слайде), клавиатура и
 * колесо работают без кода, а до гидрации и при сбое чанка motion карусель
 * остаётся рабочей прокруткой. Скрипт делает три вещи: автопрокрутку, точки и
 * кнопку паузы.
 *
 * Автопрокрутка стоит, пока на карусель наведена мышь, на ней стоит фокус, к ней
 * прикасаются, она вне экрана или её остановили кнопкой (WCAG 2.2.2: движущееся
 * дольше пяти секунд нужно уметь остановить). При `prefers-reduced-motion`
 * автопрокрутки нет вовсе, а листание мгновенное.
 *
 * Пропорции фиксированы и общие для всех слайдов (3:2 на телефоне, 3:1 с `md`,
 * как `BANNER_SPECS`), поэтому страница не прыгает ни при загрузке картинок, ни
 * при смене слайда. Слайд без десктопного баннера на широком экране кадрируется
 * (`cover`) из мобильного. Акция без мобильного баннера в карусель не попадает:
 * ей нечем быть на телефоне, а телефон - основной экран.
 */

/** Слайд считается переключённым, когда скролл ушёл дальше половины его ширины. */
const roundIndex = (scrollLeft: number, width: number): number =>
  width === 0 ? 0 : Math.round(scrollLeft / width)

export const PromoCarousel: FC<IPromoCarouselProps & IBasicStyling> = ({
  promotions,
  buildPromotionHref,
  intervalMs = PROMO_CAROUSEL_INTERVAL_MS,
  className,
}) => {
  const slides = promotions.filter(promotion => promotion.bannerMobileUrl !== null)
  const count = slides.length
  const isReduced = useReducedMotion() ?? false
  const rootRef = useRef<HTMLElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(rootRef)
  const [index, setIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isTouching, setIsTouching] = useState(false)
  /** Остановка кнопкой - выбор человека, он держится, пока тот не нажмёт ещё раз. */
  const [isStopped, setIsStopped] = useState(false)

  const canAutoplay = count > 1 && !isReduced
  const isPaused = isStopped || isHovered || isFocused || isTouching || !isInView

  const goTo = useCallback(
    (target: number): void => {
      const scroller = scrollerRef.current

      if (scroller === null) {
        return
      }

      scroller.scrollTo({
        left: target * scroller.clientWidth,
        behavior: isReduced ? 'auto' : 'smooth',
      })
    },
    [isReduced]
  )

  /*
    Таймер заводится заново после каждой смены слайда, в том числе ручной:
    свайп не должен сопровождаться ещё и автоматическим скачком через долю секунды.
  */
  useEffect(() => {
    if (!canAutoplay || isPaused) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      goTo((index + 1) % count)
    }, intervalMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [canAutoplay, isPaused, index, count, intervalMs, goTo])

  if (count === 0) {
    return null
  }

  return (
    <section
      ref={rootRef}
      className={clsx(styles.container, className)}
      aria-roledescription="carousel"
      aria-label="Акции"
      onPointerEnter={event => {
        // Палец «наводится» только на время касания, и его ведёт `onTouchStart`.
        if (event.pointerType === 'mouse') {
          setIsHovered(true)
        }
      }}
      onPointerLeave={() => {
        setIsHovered(false)
      }}
      onFocus={() => {
        setIsFocused(true)
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsFocused(false)
        }
      }}
      onTouchStart={() => {
        setIsTouching(true)
      }}
      onTouchEnd={() => {
        setIsTouching(false)
      }}
      onTouchCancel={() => {
        setIsTouching(false)
      }}
    >
      <div
        ref={scrollerRef}
        className={styles.scroller}
        // Живая область не нужна: сам скролл не объявляется, а автопрокрутку слепой не ждёт.
        aria-live={isPaused ? 'polite' : 'off'}
        onScroll={event => {
          const target = event.currentTarget
          const next = roundIndex(target.scrollLeft, target.clientWidth)

          setIndex(current => (current === next ? current : next))
        }}
      >
        {slides.map((promotion, position) => {
          const isCurrent = position === index

          return (
            <div
              key={promotion.id}
              className={styles.slide}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} из ${count}`}
            >
              <AppLink
                href={buildPromotionHref(promotion.slug)}
                className={styles.link}
                // Не текущие слайды вне порядка табуляции: фокус не должен уезжать за кадр.
                {...(isCurrent ? {} : { tabIndex: -1 })}
              >
                <picture>
                  {promotion.bannerDesktopUrl !== null && (
                    <source
                      media={`(min-width: ${breakpoints.md}px)`}
                      srcSet={promotion.bannerDesktopUrl}
                    />
                  )}

                  <img
                    className={styles.image}
                    src={promotion.bannerMobileUrl ?? ''}
                    alt={promotion.title}
                    width={BANNER_SPECS.mobile.width}
                    height={BANNER_SPECS.mobile.height}
                    // Первый баннер - то, что видно сразу; остальные ждут своей очереди.
                    loading={position === 0 ? 'eager' : 'lazy'}
                    fetchPriority={position === 0 ? 'high' : 'auto'}
                    decoding="async"
                    draggable={false}
                  />
                </picture>
              </AppLink>
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <div className={styles.controls}>
          {canAutoplay && (
            <button
              type="button"
              className={styles.control}
              aria-label={isStopped ? 'Запустить прокрутку акций' : 'Остановить прокрутку акций'}
              onClick={() => {
                setIsStopped(current => !current)
              }}
            >
              {isStopped ? <IconPlay /> : <IconPause />}
            </button>
          )}

          {slides.map((promotion, position) => {
            const isCurrent = position === index

            return (
              <button
                key={promotion.id}
                type="button"
                className={styles.control}
                aria-label={`Акция ${position + 1} из ${count}: ${promotion.title}`}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => {
                  goTo(position)
                }}
              >
                <m.span
                  className={styles.dot}
                  initial={false}
                  animate={{
                    scaleX: isCurrent ? PROMO_DOT_ACTIVE_SCALE : 1,
                    opacity: isCurrent ? 1 : 0.6,
                  }}
                  transition={isReduced ? { duration: 0 } : PROMO_DOT_TRANSITION}
                />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
