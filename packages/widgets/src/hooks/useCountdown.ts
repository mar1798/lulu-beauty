import { useSyncExternalStore } from 'react'

/**
 * Обратный отсчёт до дедлайна сбора заказов.
 *
 * Тикает через `useSyncExternalStore`, а не `useState` + `useEffect`:
 * текущее время — внешний источник, на сервере его знать нельзя, и любой
 * вариант с «сохраним `Date.now()` в состояние при монтировании» упирается в
 * синхронный `setState` внутри эффекта (запрещён линтером и вызывает лишний
 * каскад рендеров).
 *
 * До гидратации `isReady === false` — компонент должен показать заглушку,
 * а не «время истекло»: на сервере снимок всегда нулевой.
 */

const SECOND = 1000
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export interface ICountdown {
  days: number
  hours: number
  minutes: number
  seconds: number
  /** Дедлайн уже прошёл (или его нет). */
  isExpired: boolean
  /** Время на клиенте известно: до гидратации — `false`. */
  isReady: boolean
}

const subscribe = (onChange: () => void): (() => void) => {
  const timer = setInterval(onChange, SECOND)

  return () => clearInterval(timer)
}

/** Снимок в секундах — число, поэтому сравнение по значению стабильно. */
const getSnapshot = (): number => Math.floor(Date.now() / SECOND)

const getServerSnapshot = (): number => 0

const EXPIRED: ICountdown = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  isExpired: true,
  isReady: true,
}

export const useCountdown = (deadlineAt: string | null): ICountdown => {
  const nowSeconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (nowSeconds === 0) {
    return { ...EXPIRED, isExpired: false, isReady: false }
  }

  if (deadlineAt === null) {
    return EXPIRED
  }

  const deadline = Date.parse(deadlineAt)

  if (Number.isNaN(deadline)) {
    return EXPIRED
  }

  const left = Math.floor(deadline / SECOND) - nowSeconds

  if (left <= 0) {
    return EXPIRED
  }

  return {
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / HOUR),
    minutes: Math.floor((left % HOUR) / MINUTE),
    seconds: left % MINUTE,
    isExpired: false,
    isReady: true,
  }
}
