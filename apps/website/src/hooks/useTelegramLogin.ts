import { useCallback, useEffect, useRef, useState } from 'react'
import type { TelegramLoginStatus } from 'widgets/types'
import { useAuth } from '@/contexts/AuthContext'
import { isApiError, messageForError } from '@/services/apiErrors'

/**
 * Вход через Telegram глазами вкладки: открыть сессию и ждать подтверждения.
 *
 * Опрос, а не веб-сокет: подтверждение приходит один раз за вход и почти всегда
 * в первые полминуты — держать соединение ради одного события дороже, чем
 * спросить пятнадцать раз.
 *
 * Сессия открывается **сразу**, на монтировании: ссылка нужна человеку в первую
 * же секунду, а спрятать её за «нажмите, чтобы получить ссылку» значит добавить
 * шаг ровно там, где мы их убирали.
 */

const POLL_INTERVAL_MS = 2000

/** Пока сессия жива на бэке (`AUTH_SESSION_TTL_SECONDS` = 5 мин) — с запасом на дорогу. */
const MAX_POLL_MS = 6 * 60 * 1000

const GONE = 410
const NOT_FOUND = 404

export interface ITelegramLoginState {
  botUrl: string | null
  status: TelegramLoginStatus
  error: string | null
  /** Начать заново: истёкшую ссылку не оживить, нужна новая сессия. */
  retry: () => void
}

export const useTelegramLogin = (isEnabled: boolean): ITelegramLoginState => {
  const { startTelegramLogin, pollTelegramLogin } = useAuth()

  const [botUrl, setBotUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<TelegramLoginStatus>('preparing')
  const [error, setError] = useState<string | null>(null)
  /** Счётчик попыток: смена значения — единственный способ перезапустить эффект. */
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setBotUrl(null)
    setStatus('preparing')
    setError(null)
    setAttempt(current => current + 1)
  }, [])

  /**
   * Отменяет весь цикл при размонтировании. `ref`, а не состояние: проверка
   * нужна между `await`, куда новое состояние не доедет.
   */
  const isCancelled = useRef(false)

  useEffect(() => {
    if (!isEnabled) {
      return
    }

    isCancelled.current = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const stop = (next: TelegramLoginStatus, message: string | null = null): void => {
      if (isCancelled.current) {
        return
      }

      setStatus(next)
      setError(message)
    }

    const run = async (): Promise<void> => {
      try {
        const session = await startTelegramLogin()

        if (isCancelled.current) {
          return
        }

        setBotUrl(session.botUrl)
        setStatus('waiting')
      } catch (cause: unknown) {
        stop('error', messageForError(cause, 'auth.telegram'))

        return
      }

      const deadline = Date.now() + MAX_POLL_MS

      const poll = async (): Promise<void> => {
        if (isCancelled.current) {
          return
        }

        if (Date.now() > deadline) {
          stop('expired')

          return
        }

        try {
          const user = await pollTelegramLogin()

          if (user !== null) {
            // Дальше не наше дело: страница увидит вошедшего и уведёт куда нужно.
            return
          }
        } catch (cause: unknown) {
          /*
            Сессия кончилась (410) или её не стало (404) — ждать больше нечего,
            нужна новая ссылка. Любая другая осечка — скорее всего сеть моргнула:
            следующий опрос через две секунды разберётся сам.
          */
          if (isApiError(cause) && (cause.status === GONE || cause.status === NOT_FOUND)) {
            stop('expired')

            return
          }
        }

        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
      }

      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
    }

    void run()

    return () => {
      isCancelled.current = true

      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }, [isEnabled, attempt, startTelegramLogin, pollTelegramLogin])

  return { botUrl, status, error, retry }
}
