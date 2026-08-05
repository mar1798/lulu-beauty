import { useEffect } from 'react'

/**
 * Блокировка прокрутки страницы, пока открыт модальный слой.
 *
 * Возвращает `overflow` ровно к тому значению, что было до блокировки, а не к
 * пустой строке: открытых слоёв может быть два (подтверждение поверх модалки),
 * и закрытие верхнего не должно разблокировать страницу под нижним.
 *
 * Ширина полосы прокрутки компенсируется `padding-right` — иначе на десктопе
 * страница дёргается вбок в момент открытия.
 */
export const useLockBodyScroll = (isLocked: boolean): void => {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') {
      return
    }

    const { body, documentElement } = document
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth

    body.style.overflow = 'hidden'

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
    }
  }, [isLocked])
}
