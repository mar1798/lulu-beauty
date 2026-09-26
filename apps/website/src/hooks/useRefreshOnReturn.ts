import { useEffect } from 'react'
import { useSWRConfig } from 'swr'
import { isLiveStateKey } from '@/services/swrKeys'

/**
 * Перечитать корзину, избранное и сбор, когда человек возвращается в вкладку,
 * простоявшую в фоне.
 *
 * `revalidateOnFocus` выключен на всё приложение (`_app.tsx`) ради каталога, а
 * вкладку и Mini App держат открытыми сутками: после дедлайна «Оформить» оставалась
 * живой и отвечала 409, а после открытия нового сбора каталог так и был «закрыт».
 *
 * Только после заметной паузы: переключение туда-обратно за пару секунд ничего не
 * меняет, а запросы на каждое — лишние.
 */
const MIN_HIDDEN_MS = 30_000

export const useRefreshOnReturn = (): void => {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    let hiddenAt: number | null = null

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()

        return
      }

      if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_HIDDEN_MS) {
        void mutate(isLiveStateKey)
      }

      hiddenAt = null
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return (): void => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [mutate])
}
