import clsx from 'clsx'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { m, useInView, useReducedMotion } from 'motion/react'
import type { IBannerSlide, IBasicStyling, IPromoCarouselProps } from '../../types'
import { breakpoints } from '../../breakpoints'
import { AppLink } from '../../atoms/app-link'
import { DEFAULT_CTA_LABEL } from '../../utils/banner'
import {
  PROMO_CAROUSEL_INTERVAL_MS,
  PROMO_DOT_ACTIVE_SCALE,
  PROMO_DOT_TRANSITION,
} from '../../utils/motion'
import { BANNER_SPECS } from '../../utils/promotion'
import * as styles from './PromoCarousel.css'

/**
 * Карусель над каталогом: один слайд на экран, слайд во всю ширину. Слайд - акция
 * или новость владельца; кто и в каком порядке в ней стоит, решает бэкенд
 * (`GET /banners`), виджет только рисует то, что пришло.
 *
 * Слайд бывает двух видов. Картиночный (есть мобильная картинка) - баннер, как у
 * акции. Текстовый (картинки нет, так бывает только у новости) - карточка в тех
 * же пропорциях: заголовок, текст (три строки на телефоне, две с `md`) и кнопка. Слайд без ссылки - не
 * ссылка, а обычный блок: фокусироваться в нём нечему. Внешняя ссылка открывается
 * в новой вкладке (`noopener noreferrer`).
 *
 * Листает не скрипт, а сам браузер: слайды лежат в ряду с `scroll-snap`, поэтому
 * свайп на телефоне нативный (инерция, остановка ровно на слайде), клавиатура и
 * колесо работают без кода, а до гидрации и при сбое чанка motion карусель
 * остаётся рабочей прокруткой. Скрипт делает две вещи: автопрокрутку и точки.
 *
 * Кнопки паузы нет - карусель всегда листается сама. Автопрокрутка только
 * переждёт, пока на карусель наведена мышь, на ней стоит фокус, к ней
 * прикасаются или она вне экрана: слайд не должен уезжать из-под курсора или
 * пальца. При `prefers-reduced-motion` автопрокрутки нет вовсе, а листание
 * мгновенное.
 *
 * Пропорции фиксированы и общие для всех слайдов (3:2 на телефоне, 3:1 с `md`,
 * как `BANNER_SPECS`), поэтому страница не прыгает ни при загрузке картинок, ни
 * при смене слайда. Слайд без десктопного баннера на широком экране кадрируется
 * (`cover`) из мобильного. Акция без мобильного баннера в карусель не попадает
 * (это решает бэкенд): ей нечем быть на телефоне, а телефон - основной экран.
 */

/** Слайд считается переключённым, когда скролл ушёл дальше половины его ширины. */
const roundIndex = (scrollLeft: number, width: number): number =>
  width === 0 ? 0 : Math.round(scrollLeft / width)

const SlideContent: FC<{ slide: IBannerSlide; isFirst: boolean }> = ({ slide, isFirst }) => {
  if (slide.imageMobileUrl === null) {
    return (
      <div className={styles.textCard}>
        <p className={styles.textTitle}>{slide.title}</p>
        {slide.text !== null && <p className={styles.textBody}>{slide.text}</p>}
        {/* Подпись, а не кнопка: вся карточка - одна ссылка, вложенный интерактив был бы лишним. */}
        {slide.href !== null && (
          <span className={styles.cta}>{slide.ctaLabel ?? DEFAULT_CTA_LABEL}</span>
        )}
      </div>
    )
  }

  return (
    <picture>
      {slide.imageDesktopUrl !== null && (
        <source media={`(min-width: ${breakpoints.md}px)`} srcSet={slide.imageDesktopUrl} />
      )}

      <img
        className={styles.image}
        src={slide.imageMobileUrl}
        alt={slide.title}
        width={BANNER_SPECS.mobile.width}
        height={BANNER_SPECS.mobile.height}
        // Первый баннер - то, что видно сразу; остальные ждут своей очереди.
        loading={isFirst ? 'eager' : 'lazy'}
        fetchPriority={isFirst ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
      />
    </picture>
  )
}

export const PromoCarousel: FC<IPromoCarouselProps & IBasicStyling> = ({
  slides,
  intervalMs = PROMO_CAROUSEL_INTERVAL_MS,
  className,
}) => {
  const count = slides.length
  const isReduced = useReducedMotion() ?? false
  const rootRef = useRef<HTMLElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(rootRef)
  const [index, setIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isTouching, setIsTouching] = useState(false)

  const canAutoplay = count > 1 && !isReduced
  const isPaused = isHovered || isFocused || isTouching || !isInView

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
      aria-label="Акции и новости"
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
        {slides.map((slide, position) => {
          const isCurrent = position === index
          const content = <SlideContent slide={slide} isFirst={position === 0} />

          return (
            <div
              key={slide.key}
              className={styles.slide}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} из ${count}`}
            >
              {slide.href === null ? (
                <div className={styles.link}>{content}</div>
              ) : (
                <AppLink
                  href={slide.href}
                  className={styles.link}
                  // Не текущие слайды вне порядка табуляции: фокус не должен уезжать за кадр.
                  {...(isCurrent ? {} : { tabIndex: -1 })}
                  {...(slide.isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {content}
                </AppLink>
              )}
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <div className={styles.controls}>
          {slides.map((slide, position) => {
            const isCurrent = position === index

            return (
              <button
                key={slide.key}
                type="button"
                className={styles.control}
                aria-label={`Слайд ${position + 1} из ${count}: ${slide.title}`}
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
                    opacity: isCurrent ? 0.95 : 0.5,
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
