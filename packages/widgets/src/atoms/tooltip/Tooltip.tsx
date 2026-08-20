import clsx from 'clsx'
import { useLayoutEffect, useRef, type FC } from 'react'
import type { IBasicStyling, ITooltipProps } from '../../types'
import * as styles from './Tooltip.css'

/** Зазор до края экрана, ближе которого пузырь не подходит. */
const EDGE = 8

/**
 * Подсказка над триггером: всплывает на наведении и на фокусе внутри обёртки.
 *
 * Показ держит CSS (`:hover`/`:focus-within`) — состояния у компонента нет.
 * Единственное, чего CSS не умеет, — узнать, упирается ли пузырь в край
 * экрана; этим занимается `align` ниже.
 *
 * Портала нет: он понадобился бы, только если бы подсказку обрезал предок с
 * `overflow: hidden`; ни один из нынешних потребителей таким не является.
 *
 * Пузырь скрыт от скринридера (`aria-hidden`): вставить `aria-describedby` в
 * произвольный `children` нельзя, а подсказка без связи с триггером читалась бы
 * как оторванный от всего текст. Поэтому тот же текст обязан попадать в
 * доступное имя самого триггера — так это делают `Button`/`IconButton`
 * (`unavailableReason` уходит в скрытую подпись внутри кнопки).
 */

/* ------------------------------------------------------------------ *
 * Общий реестр смонтированных подсказок.
 *
 * Раньше каждый экземпляр считал поправку сам и вешал свой `resize`-слушатель.
 * На странице каталога подсказок до двух десятков (закрытый сбор оборачивает в
 * неё кнопку каждой карточки), и каждая чередовала записи в `style` с чтениями
 * геометрии — то есть заставляла браузер пересчитывать раскладку заново. Здесь
 * фазы разнесены: сперва все записи, потом все чтения, потом снова записи, —
 * и на всю страницу приходится два пересчёта вместо двух десятков. Слушатель
 * тоже один, с троттлингом по кадру.
 * ------------------------------------------------------------------ */

const mounted = new Set<HTMLSpanElement>()

let scheduled = false

const register = (bubble: HTMLSpanElement): (() => void) => {
  mounted.add(bubble)

  if (mounted.size === 1) {
    window.addEventListener('resize', onResize)
  }

  // Микрозадачей, а не сразу: соседние подсказки монтируются в одном коммите,
  // и общий проход по ним успевает пройти до кадра.
  schedule()

  return () => {
    mounted.delete(bubble)

    if (mounted.size === 0) {
      window.removeEventListener('resize', onResize)
    }
  }
}

const onResize = (): void => {
  if (scheduled) {
    return
  }

  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    alignAll()
  })
}

const schedule = (): void => {
  if (scheduled) {
    return
  }

  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    alignAll()
  })
}

/**
 * Прижимает пузыри к экрану — все разом, в три фазы.
 *
 * Пузырь центрован по триггеру и бывает шире карточки: у правой колонки
 * каталога его половина уезжает за правый край телефона.
 *
 * Замер обязан идти по раскрытому пузырю: пока он `display: none`, у него нет
 * ни размеров, ни позиции. Показываем его ровно на время замера — кадр между
 * фазами не рисуется, увидеть эту вспышку нельзя.
 *
 * Горизонтальным переполнением страницы поправка не заведует — его закрывает
 * `overflow-x: clip` у корня (`global.css.ts`). Задача ровно одна: чтобы текст
 * подсказки не оказался обрезан этим клипом.
 */
const alignAll = (): void => {
  const bubbles = [...mounted]
  const revealed: HTMLSpanElement[] = []

  for (const bubble of bubbles) {
    bubble.style.removeProperty(styles.shiftVar)

    if (bubble.getClientRects().length === 0) {
      bubble.style.display = 'block'
      revealed.push(bubble)
    }
  }

  // `clientWidth`, а не `innerWidth`: у последнего в ширину входит полоса прокрутки.
  const limit = document.documentElement.clientWidth - EDGE
  const rects = bubbles.map(bubble => bubble.getBoundingClientRect())

  for (const bubble of revealed) {
    bubble.style.removeProperty('display')
  }

  bubbles.forEach((bubble, index) => {
    const rect = rects[index]

    if (rect === undefined) {
      return
    }

    const overflowRight = rect.right - limit
    const overflowLeft = EDGE - rect.left
    const shift = overflowRight > 0 ? -overflowRight : Math.max(overflowLeft, 0)

    if (shift !== 0) {
      bubble.style.setProperty(styles.shiftVar, `${Math.round(shift)}px`)
    }
  })
}

export const Tooltip: FC<ITooltipProps & IBasicStyling> = ({
  content,
  children,
  placement = 'top',
  isBlock = false,
  className,
}) => {
  const bubbleRef = useRef<HTMLSpanElement>(null)

  /*
    `useLayoutEffect`, а не `useEffect`: регистрация обязана случиться до первого
    кадра — иначе первый же показ подсказки успевает мигнуть непоправленным.
  */
  useLayoutEffect(() => {
    const bubble = bubbleRef.current

    if (bubble === null) {
      return
    }

    return register(bubble)
  }, [content, placement])

  return (
    <span
      className={clsx(styles.container, isBlock && styles.block, className)}
    >
      {children}

      <span
        ref={bubbleRef}
        role="tooltip"
        aria-hidden={true}
        className={clsx(styles.bubble, styles.placement[placement])}
      >
        {content}
      </span>
    </span>
  )
}
