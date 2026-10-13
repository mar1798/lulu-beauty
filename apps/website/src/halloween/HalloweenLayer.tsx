import clsx from 'clsx'
import React, { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { BatFlap } from './BatFlap'
import { Deco } from './HalloweenScene'
import { BAT_FLIGHT, HALLOWEEN_ASSETS, HALLOWEEN_PAUSED_ATTRIBUTE } from './config'
import { useHalloween } from './useHalloween'
import * as styles from './halloween.css'

/** Точек на траектории: дуга из прямых отрезков, при восьми изломов не видно. */
const FLIGHT_STEPS = 8

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min)

/**
 * Траектория одного пролёта: через весь экран по плавной дуге, в случайную
 * сторону и на случайной высоте. Горизонталь равномерная, вертикаль —
 * полуволна синуса, поэтому мышь набирает высоту и снижается, а не скачет.
 */
const flightKeyframes = (size: number): Keyframe[] => {
  const width = window.innerWidth
  const height = window.innerHeight
  const isLeftToRight = Math.random() < 0.5
  const startY = height * randomBetween(0.3, 0.6)
  const endY = height * randomBetween(0.2, 0.55)
  const lift = height * randomBetween(0.12, 0.22)
  const from = isLeftToRight ? -size * 2 : width + size
  const to = isLeftToRight ? width + size : -size * 2

  return Array.from({ length: FLIGHT_STEPS + 1 }, (_, step) => {
    const t = step / FLIGHT_STEPS
    const x = from + (to - from) * t
    const y = startY + (endY - startY) * t - lift * Math.sin(Math.PI * t)
    // Лёгкий крен по ходу дуги: вверх на подъёме, вниз на снижении.
    const tilt = (isLeftToRight ? -1 : 1) * 8 * Math.cos(Math.PI * t)

    return { transform: `translate(${x}px, ${y}px) rotate(${tilt}deg)` }
  })
}

/**
 * Пролёт летучей мыши. Один элемент на всё приложение — между пролётами он
 * ждёт за краем экрана, а не пересоздаётся.
 *
 * На витрине мышь пролетает чаще, на остальных страницах — реже (`BAT_FLIGHT`).
 * Скрытая вкладка ставит всё на паузу: таймер снимается, начатый пролёт
 * замирает и доигрывает, когда вкладку откроют. При сокращённом движении
 * пролётов нет совсем.
 *
 * Мышь — встроенный SVG (`BatFlap`): в `<img>` крылья не машут. Между
 * пролётами крылья стоят (`data-halloween-paused`) — иначе мышь за краем
 * экрана перерисовывалась бы каждый кадр впустую.
 */
const BatFlight: React.FC<{ isCatalog: boolean }> = ({ isCatalog }) => {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const bat = ref.current

    if (bat === null || typeof bat.animate !== 'function') {
      return
    }

    const range = isCatalog ? BAT_FLIGHT.catalog : BAT_FLIGHT.other
    const reducedMotion = window.matchMedia(REDUCED_MOTION)
    let timer: number | undefined
    let flight: Animation | null = null

    const schedule = (delay: number): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(fly, delay)
    }

    const fly = (): void => {
      if (document.hidden) {
        return
      }

      if (reducedMotion.matches) {
        schedule(randomBetween(range.min, range.max))
        return
      }

      bat.removeAttribute(HALLOWEEN_PAUSED_ATTRIBUTE)
      flight = bat.animate(flightKeyframes(bat.offsetWidth), {
        duration: BAT_FLIGHT.durationMs,
        easing: 'linear',
      })
      flight.onfinish = () => {
        flight = null
        bat.setAttribute(HALLOWEEN_PAUSED_ATTRIBUTE, '')
        schedule(randomBetween(range.min, range.max))
      }
    }

    const handleVisibility = (): void => {
      if (document.hidden) {
        window.clearTimeout(timer)
        flight?.pause()
        return
      }

      if (flight !== null) {
        flight.play()
      } else {
        schedule(randomBetween(range.min, range.max))
      }
    }

    schedule(BAT_FLIGHT.firstDelayMs)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearTimeout(timer)
      flight?.cancel()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isCatalog])

  return (
    <span ref={ref} className={styles.flyingBat} {...{ [HALLOWEEN_PAUSED_ATTRIBUTE]: '' }}>
      <BatFlap />
    </span>
  )
}

/**
 * Глобальный слой хэллоуинского оформления: виньетка «сумерек», паутина в
 * верхних углах, пролёт летучей мыши и — на главной и в каталоге — паук под
 * правой паутиной (только на телефоне). Стоит в `_app` — на всех страницах.
 * Фон холста сюда не входит: его до первого кадра ставит ранний скрипт
 * (`earlyScript.ts`). Вне сезона — `null`.
 */
export const HalloweenLayer: React.FC = () => {
  const isActive = useHalloween()
  const { pathname } = useRouter()

  if (!isActive) {
    return null
  }

  return (
    <div aria-hidden={true} style={{ display: 'contents' }}>
      <div className={styles.vignette} />

      {/* eslint-disable-next-line @next/next/no-img-element -- SVG-декор из public */}
      <img
        src={HALLOWEEN_ASSETS.cobweb}
        alt=""
        width={180}
        height={180}
        decoding="async"
        draggable={false}
        className={clsx(styles.cobweb, styles.cobwebLeft)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG-декор из public */}
      <img
        src={HALLOWEEN_ASSETS.cobweb}
        alt=""
        width={180}
        height={180}
        decoding="async"
        draggable={false}
        className={clsx(styles.cobweb, styles.cobwebRight)}
      />

      <BatFlight isCatalog={pathname === '/catalog'} />

      {(pathname === '/' || pathname === '/catalog') && (
        <Deco asset="spider" className={styles.stickySpider} isSwinging={true} isEager={true} />
      )}
    </div>
  )
}
