import { useEffect, useState } from 'react'

/**
 * Значение с задержкой. Нужен поиску по каталогу: `SearchField` управляемый и
 * обновляется на каждый символ, а запрос в API должен уходить, когда человек
 * закончил печатать.
 *
 * Таймер перезапускается на каждое изменение, поэтому серия быстрых нажатий
 * даёт ровно одно обновление.
 */
const DEFAULT_DELAY = 400

export const useDebouncedValue = <T>(value: T, delay: number = DEFAULT_DELAY): T => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
