import { useCallback, useSyncExternalStore } from 'react'

/**
 * Совпадает ли медиазапрос — с подпиской на изменения.
 *
 * На сервере всегда «нет»: окна там нет, а верное значение подставит первая же
 * отрисовка в браузере (см. `useTelegramWebview` — тот же приём).
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      const list = window.matchMedia(query)

      list.addEventListener('change', onChange)

      return (): void => list.removeEventListener('change', onChange)
    },
    [query]
  )

  const getSnapshot = useCallback((): boolean => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, (): boolean => false)
}
