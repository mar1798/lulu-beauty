import { useEffect, useState, type RefObject } from 'react'

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
  /*
    Узел живёт в состоянии, а не только в `ref.current`, потому что появляется
    он позже первого коммита: `Portal` до своего эффекта возвращает `null`, а
    модалку почти всегда монтируют уже открытой. Эффект с зависимостью только
    от `isActive` попадал в этот момент на пустой ref, выходил по раннему
    возврату — и больше не запускался никогда, потому что `isActive` не менялся.
    Ловушки не было вовсе: ни начального фокуса, ни зацикливания Tab, ни
    возврата фокуса при закрытии.

    Ref остаётся объектом (`ref={...}` у потребителей не меняется) — сеттер лишь
    превращает присваивание React'а в перерисовку. React пишет в `current`
    только при монтировании и размонтировании узла, так что цикла тут нет.
  */
  const [container, setContainer] = useState<T | null>(null)
  const [ref] = useState<RefObject<T | null>>(() => {
    let current: T | null = null

    return {
      get current(): T | null {
        return current
      },
      set current(next: T | null) {
        current = next
        setContainer(next)
      },
    }
  })

  useEffect(() => {
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
  }, [isActive, container])

  return ref
}
