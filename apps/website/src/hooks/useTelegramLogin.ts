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

/**
 * Первые полминуты — часто: подтверждение почти всегда приходит именно там, и
 * лишняя секунда ожидания на пустой вкладке заметна.
 */
const POLL_INTERVAL_MS = 2000

/**
 * Дальше — реже. Не косметика: `/auth/telegram/claim` попадает под общий бюджет
 * лимитера, и опрос раз в две секунды все шесть минут выжигал его сам себе —
 * человек, который две минуты искал бота, получал 429 вместо входа. Пять секунд
 * держат расход втрое ниже пополнения.
 */
const SLOW_POLL_INTERVAL_MS = 5000

/** Как долго опрашиваем часто, прежде чем перейти на редкий шаг. */
const FAST_POLL_WINDOW_MS = 30_000

/** Пока сессия жива на бэке (`AUTH_SESSION_TTL_SECONDS` = 5 мин) — с запасом на дорогу. */
const MAX_POLL_MS = 6 * 60 * 1000

/** Запас к `expiresAt` сохранённой сессии — тот же смысл, что у минуты сверху в `MAX_POLL_MS`. */
const RESUME_MARGIN_MS = 60 * 1000

/** Один опрос дольше этого — сеть повисла; следующий опрос пойдёт по новой. */
const POLL_TIMEOUT_MS = 10_000

const GONE = 410
const NOT_FOUND = 404

/**
 * Ссылка открытой сессии — на случай, если вкладку выгрузят, пока человек в Telegram.
 *
 * iOS выгружает фоновые вкладки без спроса, и после возврата `/login` открывался
 * заново — с новой сессией вместо той, что человек только что подтвердил в боте.
 * Секрет опроса лежит в httpOnly-cookie `lb_ls` и перезагрузку переживает, а ссылку на
 * бота нужно помнить самим: без неё экрану ожидания нечего показать.
 */
const SAVED_SESSION_KEY = 'lb_login_session'

interface ISavedSession {
  botUrl: string
  expiresAt: string
}

const readSavedSession = (): ISavedSession | null => {
  try {
    const raw = window.sessionStorage.getItem(SAVED_SESSION_KEY)

    if (raw === null) {
      return null
    }

    const saved = JSON.parse(raw) as Partial<ISavedSession>

    if (typeof saved.botUrl !== 'string' || typeof saved.expiresAt !== 'string') {
      return null
    }

    return Date.parse(saved.expiresAt) > Date.now()
      ? { botUrl: saved.botUrl, expiresAt: saved.expiresAt }
      : null
  } catch {
    return null
  }
}

const saveSession = (session: ISavedSession | null): void => {
  try {
    if (session === null) {
      window.sessionStorage.removeItem(SAVED_SESSION_KEY)
    } else {
      window.sessionStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(session))
    }
  } catch {
    // Хранилище недоступно (приватный режим) — просто не переживём перезагрузку.
  }
}

/** `AbortSignal.timeout` есть не во всех webview; без него опрос просто без таймаута. */
const pollSignal = (): AbortSignal | undefined =>
  typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(POLL_TIMEOUT_MS) : undefined

const isSessionGone = (cause: unknown): boolean =>
  isApiError(cause) && (cause.status === GONE || cause.status === NOT_FOUND)

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

  /*
    Защёлка: раз начав, вход не останавливаем. `isEnabled` зависит от `isLoading`
    сессии, а SWR при повторе упавшего `/api/auth/me` снова выставляет его в true —
    эффект снимался, таймер опроса гас, а повторный запуск считался повтором того же
    прогона и цикл не поднимал. Экран «Продолжите вход в Telegram» висел навсегда.
  */
  const [isStarted, setIsStarted] = useState(isEnabled)

  if (isEnabled && !isStarted) {
    setIsStarted(true)
  }

  const retry = useCallback(() => {
    saveSession(null)
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

  /**
   * Номер попытки, для которой сессия уже открыта.
   *
   * `StrictMode` в разработке прогоняет эффект дважды, а сессия открывается
   * сразу на монтировании — без этой отметки каждый заход на `/login` заводил
   * на бэкенде две сессии вместо одной: первую тут же бросала отмена, вторую
   * человек и подтверждал. На пользователей это не влияло (в проде
   * `StrictMode` не работает), но лимитер частоты и таблицу сессий
   * замусоривало, а отладку их показаний делало вдвое веселее.
   *
   * `null` — ещё ни одной; `retry` меняет `attempt`, и новая попытка честно
   * заводит свою сессию.
   */
  const startedAttempt = useRef<number | null>(null)

  /**
   * Состояние цикла опроса — общее на все прогоны эффекта, а не локальное.
   *
   * Повтор прогона (StrictMode) сам цикл не запускает — его ведёт первый прогон, —
   * но слушает возврат во вкладку и снимает таймер на «уборке». С локальными
   * переменными он видел свой нулевой `deadline`: опрос по возвращении из Telegram в
   * dev молчал, а таймер первого прогона «уборке» был недоступен.
   */
  const loop = useRef<{
    timer: ReturnType<typeof setTimeout> | undefined
    isPolling: boolean
    deadline: number
    startedAt: number
  }>({ timer: undefined, isPolling: false, deadline: 0, startedAt: 0 })

  useEffect(() => {
    if (!isStarted) {
      return
    }

    isCancelled.current = false

    /*
      Повтор того же прогона (StrictMode) новую сессию не открывает.

      Цикл первого прогона при этом не теряется: `run` в момент «уборки» висит
      на `await` открытия сессии, а `isCancelled` — общий на все прогоны ref, и
      строка выше уже вернула его в `false`. Когда ответ доедет, проверка
      отмены его пропустит, и опрос пойдёт как ни в чём не бывало — уже по той
      единственной сессии, что успела открыться.
    */
    const isRepeat = startedAttempt.current === attempt

    startedAttempt.current = attempt

    const state = loop.current

    // Новая попытка — новый цикл: прежний дедлайн к ней не относится.
    if (!isRepeat) {
      state.deadline = 0
      state.startedAt = 0
    }

    const stop = (next: TelegramLoginStatus, message: string | null = null): void => {
      if (isCancelled.current) {
        return
      }

      if (next === 'expired') {
        saveSession(null)
      }

      setStatus(next)
      setError(message)
    }

    const nextDelay = (): number =>
      Date.now() - state.startedAt < FAST_POLL_WINDOW_MS ? POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS

    const schedule = (): void => {
      if (state.timer !== undefined) {
        clearTimeout(state.timer)
      }

      state.timer = setTimeout(() => void poll(), nextDelay())
    }

    const poll = async (): Promise<void> => {
      if (isCancelled.current || state.isPolling || state.deadline === 0) {
        return
      }

      if (Date.now() > state.deadline) {
        stop('expired')

        return
      }

      state.isPolling = true

      try {
        const user = await pollTelegramLogin(pollSignal())

        if (user !== null) {
          saveSession(null)

          // Дальше не наше дело: страница увидит вошедшего и уведёт куда нужно.
          return
        }
      } catch (cause: unknown) {
        /*
          Сессия кончилась (410) или её не стало (404) — ждать больше нечего,
          нужна новая ссылка. Любая другая осечка — сеть моргнула или запрос
          упёрся в таймаут: следующий опрос разберётся сам.
        */
        if (isSessionGone(cause)) {
          stop('expired')

          return
        }
      } finally {
        state.isPolling = false
      }

      if (!isCancelled.current) {
        schedule()
      }
    }

    const startPolling = (until: number): void => {
      state.startedAt = Date.now()
      state.deadline = until
      schedule()
    }

    /*
      Сначала — сессия, открытая до перезагрузки. Подтверждена — вход готов сразу;
      ещё ждёт — показываем ту же ссылку; её нет — открываем новую.
    */
    const resume = async (): Promise<boolean> => {
      const saved = readSavedSession()

      if (saved === null) {
        return false
      }

      try {
        const user = await pollTelegramLogin(pollSignal())

        if (isCancelled.current) {
          return true
        }

        if (user !== null) {
          saveSession(null)

          return true
        }

        setBotUrl(saved.botUrl)
        setStatus('waiting')
        startPolling(Date.parse(saved.expiresAt) + RESUME_MARGIN_MS)

        return true
      } catch (cause: unknown) {
        if (isCancelled.current) {
          return true
        }

        // Сессии нет (404) или она истекла (410) — открываем новую.
        if (isSessionGone(cause)) {
          saveSession(null)

          return false
        }

        /*
          Любая другая осечка — сеть моргнула или опрос упёрся в таймаут. Сессия,
          которую человек, возможно, уже подтвердил в боте, от этого не пропала:
          показываем её ссылку и опрашиваем дальше, а не выдаём новую.
        */
        setBotUrl(saved.botUrl)
        setStatus('waiting')
        startPolling(Date.parse(saved.expiresAt) + RESUME_MARGIN_MS)

        return true
      }
    }

    const run = async (): Promise<void> => {
      if (attempt === 0 && (await resume())) {
        return
      }

      if (isCancelled.current) {
        return
      }

      try {
        const session = await startTelegramLogin()

        if (isCancelled.current) {
          return
        }

        saveSession({ botUrl: session.botUrl, expiresAt: session.expiresAt })
        setBotUrl(session.botUrl)
        setStatus('waiting')
      } catch (cause: unknown) {
        stop('error', messageForError(cause, 'auth.telegram'))

        return
      }

      startPolling(Date.now() + MAX_POLL_MS)
    }

    /*
      Вернулся из Telegram — спрашиваем сразу, а не через пять секунд: подтверждение
      почти наверняка уже случилось, пока вкладка стояла в фоне. `pageshow` — для
      страницы, поднятой из bfcache, где `visibilitychange` не приходит.
    */
    const pollNow = (): void => {
      if (document.visibilityState === 'visible') {
        void poll()
      }
    }

    document.addEventListener('visibilitychange', pollNow)
    window.addEventListener('pageshow', pollNow)

    if (!isRepeat) {
      void run()
    }

    return () => {
      isCancelled.current = true
      document.removeEventListener('visibilitychange', pollNow)
      window.removeEventListener('pageshow', pollNow)

      if (state.timer !== undefined) {
        clearTimeout(state.timer)
        state.timer = undefined
      }
    }
  }, [isStarted, attempt, startTelegramLogin, pollTelegramLogin])

  return { botUrl, status, error, retry }
}
