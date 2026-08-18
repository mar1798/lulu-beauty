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
export const Tooltip: FC<ITooltipProps & IBasicStyling> = ({
  content,
  children,
  placement = 'top',
  isBlock = false,
  className,
}) => {
  const bubbleRef = useRef<HTMLSpanElement>(null)

  /*
    `useLayoutEffect`, а не `useEffect`: поправка обязана лечь до первого
    кадра — иначе первый же показ подсказки успевает мигнуть непоправленным.
  */
  useLayoutEffect(() => {
    const bubble = bubbleRef.current

    if (bubble === null) {
      return
    }

    /**
     * Прижимает пузырь к экрану.
     *
     * Пузырь центрован по триггеру и бывает шире карточки: у правой колонки
     * каталога его половина уезжает за правый край телефона.
     *
     * Считается это **до** первого показа — в раскладочном эффекте и дальше
     * только на `resize`. На наведении было бы поздно: поправка успевала
     * примениться лишь следующим кадром, и подсказка на глазах перескакивала
     * с неверного места на верное.
     *
     * Горизонтальным переполнением страницы поправка при этом не заведует —
     * его закрывает `overflow-x: clip` у корня (`global.css.ts`). Здесь задача
     * ровно одна: чтобы текст подсказки не оказался обрезан этим клипом.
     */
    const align = (): void => {
      bubble.style.removeProperty(styles.shiftVar)

      /*
        Замер обязан идти по раскрытому пузырю: пока он `display: none`, у него
        нет ни размеров, ни позиции. Показываем его ровно на время замера —
        кадр между двумя присваиваниями не рисуется, увидеть эту вспышку
        нельзя.
      */
      const isHidden = bubble.getClientRects().length === 0

      if (isHidden) {
        bubble.style.display = 'block'
      }

      const rect = bubble.getBoundingClientRect()

      if (isHidden) {
        bubble.style.removeProperty('display')
      }

      // `clientWidth`, а не `innerWidth`: у последнего в ширину входит полоса прокрутки.
      const overflowRight = rect.right - (document.documentElement.clientWidth - EDGE)
      const overflowLeft = EDGE - rect.left
      const shift = overflowRight > 0 ? -overflowRight : Math.max(overflowLeft, 0)

      if (shift !== 0) {
        bubble.style.setProperty(styles.shiftVar, `${Math.round(shift)}px`)
      }
    }

    align()

    /*
      Ширина окна — единственное, от чего поправка зависит и что меняется без
      перемонтирования: поворот телефона, изменение окна на десктопе. Прокрутка
      сюда не входит — по горизонтали страница не ездит.
    */
    window.addEventListener('resize', align)

    return () => {
      window.removeEventListener('resize', align)
    }
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
