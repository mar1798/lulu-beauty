import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { IToast, IToastTone } from '../types'
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
  description?: string
  tone?: IToastTone
  /** Мс до автозакрытия; `0` — не закрывать само (для ошибок, которые надо прочитать). */
  duration?: number
}

export interface IToastContextValue {
  toasts: IToast[]
  notify: (input: INotifyInput) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<IToastContextValue | null>(null)

const DEFAULT_DURATION = 5000

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
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string): void => {
    const timer = timers.current.get(id)

    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }

    setToasts(current => current.filter(toast => toast.id !== id))
  }, [])

  const notify = useCallback(
    (input: INotifyInput): string => {
      const toast: IToast = {
        id: nextId(),
        tone: input.tone ?? 'info',
        title: input.title,
        description: input.description,
      }

      setToasts(current => [...current, toast])

      const duration = input.duration ?? DEFAULT_DURATION

      if (duration > 0) {
        timers.current.set(
          toast.id,
          setTimeout(() => {
            dismiss(toast.id)
          }, duration)
        )
      }

      return toast.id
    },
    [dismiss]
  )

  // Размонтирование посреди показа не должно оставить висящие таймеры.
  const pending = timers.current

  useEffect(
    () => () => {
      for (const timer of pending.values()) {
        clearTimeout(timer)
      }

      pending.clear()
    },
    [pending]
  )

  const value = useMemo<IToastContextValue>(
    () => ({ toasts, notify, dismiss }),
    [toasts, notify, dismiss]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
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
