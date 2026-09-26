import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { loadTelegramWebApp, readMiniAppInitData } from '@/utils/telegramMiniApp'

/**
 * Системная кнопка «Назад» Telegram в Mini App.
 *
 * Без неё жест «назад» на Android закрывает окно целиком, а на iOS вернуться можно только
 * хлебными крошками — со сбросом фильтров и позиции прокрутки. Кнопка видна, пока внутри
 * окна есть куда возвращаться, и ведёт `router.back()` — ровно туда, где человек был.
 *
 * Глубину считаем сами: история браузера не говорит, сколько в ней записей этого окна.
 * Next кладёт в `history.state` ключ записи — `pushState` выдаёт новый, `replaceState`
 * (фильтры каталога) сохраняет прежний. Незнакомый ключ — шаг вперёд, знакомый —
 * возврат туда, где глубина уже известна.
 */
export const useTelegramBackButton = (): void => {
  const router = useRouter()

  useEffect(() => {
    if (readMiniAppInitData() === null) {
      return
    }

    const readKey = (): string => {
      const state: unknown = window.history.state

      if (typeof state === 'object' && state !== null && 'key' in state) {
        return String(state.key)
      }

      return ''
    }

    const depths = new Map<string, number>([[readKey(), 0]])
    let depth = 0
    let isActive = true

    const goBack = (): void => {
      router.back()
    }

    const sync = (): void => {
      void loadTelegramWebApp().then(app => {
        const button = app?.BackButton

        if (!isActive || button === undefined) {
          return
        }

        if (depth > 0) {
          button.show()
        } else {
          button.hide()
        }
      })
    }

    const onRouteDone = (): void => {
      const key = readKey()
      const known = depths.get(key)

      if (known === undefined) {
        depth += 1
        depths.set(key, depth)
      } else {
        depth = known
      }

      sync()
    }

    void loadTelegramWebApp().then(app => {
      if (isActive) {
        app?.BackButton?.onClick(goBack)
      }
    })

    router.events.on('routeChangeComplete', onRouteDone)
    sync()

    return (): void => {
      isActive = false
      router.events.off('routeChangeComplete', onRouteDone)
      void loadTelegramWebApp().then(app => {
        app?.BackButton?.offClick(goBack)
        app?.BackButton?.hide()
      })
    }
    // `router` стабилен в Pages Router; перезапуск на каждый его рендер сбросил бы глубину.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
