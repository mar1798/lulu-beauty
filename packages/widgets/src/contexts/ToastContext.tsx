import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { IToast, IToastAction, IToastTone } from '../types'
import { ToastViewport } from '../organisms/toast-viewport'

/**
 * Очередь коротких уведомлений. Чистый UI: контекст ничего не знает про
 * запросы — страница сама решает, о чём сообщить.
 *
 * Живёт в `widgets`, а не в сайте, потому что уведомление — это визуальный
 * слой, а не состояние приложения; `ToastViewport` рендерится тут же, чтобы
 * потребителю хватило одного провайдера.
 */

export interface INotifyInput {
  title: string
  /** Название товара и т. п. — строкой под заголовком, см. `IToast.subject`. */
  subject?: string
  description?: string
  tone?: IToastTone
  /** Мс до автозакрытия; `0` — не закрывать само (для ошибок, которые надо прочитать). */
  duration?: number
  /**
   * Обратный ход — «Вернуть» после удаления. Пока он есть, уведомление висит
   * дольше обычного (`ACTION_DURATION`): обычных пяти секунд хватает, чтобы
   * прочитать «убрано», но не чтобы успеть передумать.
   */
  action?: IToastAction
}

export type IAnnouncePoliteness = 'polite' | 'assertive'

export interface IToastContextValue {
  toasts: IToast[]
  notify: (input: INotifyInput) => string
  dismiss: (id: string) => void
  /**
   * Сказать скринридеру, не показывая тоста: «Добавлено в корзину» после кнопки,
   * которая сменилась под фокусом. Тосты озвучиваются этим же путём сами.
   */
  announce: (message: string, politeness?: IAnnouncePoliteness) => void
}

const ToastContext = createContext<IToastContextValue | null>(null)

const DEFAULT_DURATION = 5000

/**
 * Ошибка висит дольше: в ней причина и что делать, и за пять секунд её не успевают
 * дочитать — особенно с телефона, где тост закрывает часть экрана.
 */
const DANGER_DURATION = 10000

/**
 * Пауза между очисткой live-области и новым текстом: одинаковый текст подряд без
 * неё не озвучивается — для скринридера область не изменилась.
 */
const ANNOUNCE_DELAY_MS = 50

/** Столько висит уведомление с обратным ходом — см. `INotifyInput.action`. */
const ACTION_DURATION = 10000

/**
 * Сколько уведомление живёт после того, как курсор ушёл со стопки.
 *
 * Отсчёт продолжается с того места, где встал, но не мгновенным исчезновением:
 * к «Вернуть» тянутся мышью, и тост, догоревший ровно в момент отвода курсора,
 * пропал бы у человека под рукой.
 */
const RESUME_MINIMUM = 1000

/**
 * Отсчёт до автозакрытия одного уведомления.
 *
 * Хранится остаток, а не только таймер: под курсором и под фокусом отсчёт
 * останавливается (`timer === null`), и после него надо досчитать оставшееся,
 * а не начать заново.
 */
interface IPending {
  timer: ReturnType<typeof setTimeout> | null
  remaining: number
  /** Момент, с которого идёт текущий отрезок отсчёта. */
  startedAt: number
}

let counter = 0

/**
 * Счётчик, а не `Math.random`/`Date.now`: уведомления появляются только после
 * действия пользователя, поэтому на сервере id вообще не выдаются и разойтись
 * при гидратации нечему.
 */
const nextId = (): string => {
  counter += 1

  return `toast-${counter}`
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<IToast[]>([])
  const timers = useRef(new Map<string, IPending>())
  const [announcements, setAnnouncements] = useState({ polite: '', assertive: '' })
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const announce = useCallback(
    (message: string, politeness: IAnnouncePoliteness = 'polite'): void => {
      if (announceTimer.current !== null) {
        clearTimeout(announceTimer.current)
      }

      setAnnouncements({ polite: '', assertive: '' })
      announceTimer.current = setTimeout(() => {
        announceTimer.current = null
        setAnnouncements({
          polite: politeness === 'polite' ? message : '',
          assertive: politeness === 'assertive' ? message : '',
        })
      }, ANNOUNCE_DELAY_MS)
    },
    []
  )

  /*
    Стопка останавливается целиком, а не по одному тосту: курсор всё равно
    закрывает соседей, а уезжающий из-под него сосед — то же самое исчезновение
    под рукой, от которого пауза и заводится.
  */
  const isPaused = useRef(false)

  const dismiss = useCallback((id: string): void => {
    const pending = timers.current.get(id)

    if (pending !== undefined) {
      if (pending.timer !== null) {
        clearTimeout(pending.timer)
      }

      timers.current.delete(id)
    }

    setToasts(current => current.filter(toast => toast.id !== id))
  }, [])

  /** Запускает отсчёт остатка — при показе и после снятия паузы. */
  const start = useCallback(
    (id: string, remaining: number): void => {
      timers.current.set(id, {
        remaining,
        startedAt: Date.now(),
        timer: setTimeout(() => {
          dismiss(id)
        }, remaining),
      })
    },
    [dismiss]
  )

  const pause = useCallback((): void => {
    if (isPaused.current) {
      return
    }

    isPaused.current = true

    const now = Date.now()

    for (const [id, pending] of timers.current) {
      if (pending.timer === null) {
        continue
      }

      clearTimeout(pending.timer)
      timers.current.set(id, {
        timer: null,
        startedAt: now,
        remaining: Math.max(pending.remaining - (now - pending.startedAt), RESUME_MINIMUM),
      })
    }
  }, [])

  const resume = useCallback((): void => {
    if (!isPaused.current) {
      return
    }

    isPaused.current = false

    for (const [id, pending] of timers.current) {
      if (pending.timer === null) {
        start(id, pending.remaining)
      }
    }
  }, [start])

  const notify = useCallback(
    (input: INotifyInput): string => {
      const toast: IToast = {
        id: nextId(),
        tone: input.tone ?? 'info',
        title: input.title,
        subject: input.subject,
        description: input.description,
        action: input.action,
      }

      setToasts(current => [...current, toast])
      announce(
        [toast.title, toast.subject, toast.description]
          .filter(part => part !== undefined)
          .join('. '),
        toast.tone === 'danger' ? 'assertive' : 'polite'
      )

      const duration =
        input.duration ??
        (input.action !== undefined
          ? ACTION_DURATION
          : toast.tone === 'danger'
            ? DANGER_DURATION
            : DEFAULT_DURATION)

      if (duration > 0) {
        /*
          Тост, приехавший при курсоре на стопке (ответ на то же «Вернуть»),
          встаёт сразу на паузу: иначе он досчитал бы под рукой, пока соседи
          стоят.
        */
        if (isPaused.current) {
          timers.current.set(toast.id, { timer: null, remaining: duration, startedAt: Date.now() })
        } else {
          start(toast.id, duration)
        }
      }

      return toast.id
    },
    [start, announce]
  )

  /*
    Стопка опустела — держать паузу больше не за чем. Курсор мог стоять на
    последнем уведомлении в момент закрытия: узел исчезает под ним, `pointerout`
    в этом случае приходит не везде, и следующее уведомление встало бы на паузу
    навсегда.
  */
  useEffect(() => {
    if (toasts.length === 0) {
      isPaused.current = false
    }
  }, [toasts.length])

  // Размонтирование посреди показа не должно оставить висящие таймеры.
  const pending = timers.current

  useEffect(
    () => () => {
      for (const item of pending.values()) {
        if (item.timer !== null) {
          clearTimeout(item.timer)
        }
      }

      pending.clear()

      if (announceTimer.current !== null) {
        clearTimeout(announceTimer.current)
      }
    },
    [pending]
  )

  const value = useMemo<IToastContextValue>(
    () => ({ toasts, notify, dismiss, announce }),
    [toasts, notify, dismiss, announce]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        Пауза под курсором и под фокусом — не украшение: «Вернуть» живёт
        считанные секунды, и кнопка, исчезающая на пути к ней (мышью или
        табом), не оставляет второго шанса. Заодно это WCAG 2.2.1: у таймера,
        который нельзя остановить, не должно быть ничего важного.
      */}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        onPause={pause}
        onResume={resume}
        politeAnnouncement={announcements.polite}
        assertiveAnnouncement={announcements.assertive}
      />
    </ToastContext.Provider>
  )
}

export const useToast = (): IToastContextValue => {
  const value = useContext(ToastContext)

  if (value === null) {
    throw new Error('useToast вызван вне <ToastProvider>')
  }

  return value
}
