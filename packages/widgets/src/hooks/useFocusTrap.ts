import { useEffect, useRef, type RefObject } from 'react'

/**
 * Удержание фокуса внутри модального слоя.
 *
 * Возвращает ref на контейнер диалога. Пока `isActive`, Tab и Shift+Tab
 * ходят по кругу внутри него, а при закрытии фокус возвращается элементу,
 * с которого слой открыли, — иначе после закрытия модалки клавиатурный
 * пользователь оказывается в начале страницы.
 *
 * Список фокусируемых элементов пересчитывается на каждый Tab, а не один раз
 * при открытии: содержимое диалога меняется (появляется ошибка, включается
 * кнопка), и закешированный список быстро расходится с DOM.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const focusableIn = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    element => element.offsetParent !== null || element === document.activeElement
  )

export const useFocusTrap = <T extends HTMLElement>(isActive: boolean): RefObject<T | null> => {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const container = ref.current

    if (!isActive || container === null) {
      return
    }

    const restoreTo = document.activeElement as HTMLElement | null
    const initial = focusableIn(container)[0] ?? container

    initial.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') {
        return
      }

      const items = focusableIn(container)

      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      // Фокус мог уехать за пределы диалога (клик по фону) — возвращаем его.
      if (!container.contains(active)) {
        event.preventDefault()
        first.focus()
        return
      }

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus()
    }
  }, [isActive])

  return ref
}
