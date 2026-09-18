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

/**
 * Опрос чаще секунды — намеренно.
 *
 * `setInterval` считает от монтирования, а не от границы секунды, и при дрейфе
 * таймера видимое число задерживалось бы на два тика или перескакивало через
 * значение. Пока показывались только минуты, этого не было видно; секунды
 * видны всегда. Снимок — целое число секунд, поэтому лишние опросы не доходят
 * до рендера: `useSyncExternalStore` сравнивает значения и перерисовывает
 * по-прежнему раз в секунду, а расхождение с реальной секундой падает до
 * четверти.
 */
const POLL = 250

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

/**
 * Интервал — один на все таймеры сразу, а не по одному на компонент.
 *
 * Время у них общее, и на корзине или чекауте, где счётчиков больше одного,
 * каждый будил бы браузер по своему расписанию четыре раза в секунду. Здесь
 * первый подписчик заводит интервал, последний отписавшийся его гасит.
 */
const listeners = new Set<() => void>()
let poller: ReturnType<typeof setInterval> | null = null

const notify = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange)

  if (poller === null) {
    poller = setInterval(notify, POLL)
  }

  return () => {
    listeners.delete(onChange)

    if (listeners.size === 0 && poller !== null) {
      clearInterval(poller)
      poller = null
    }
  }
}

/**
 * Подписка для случая, когда считать нечего: сбора нет или дедлайн уже прошёл.
 *
 * Значение таймера в этом состоянии не изменится никогда, а интервал жил бы,
 * пока открыта вкладка. Переключение происходит само: тик, на котором дедлайн
 * проходит, перерисовывает компонент, `subscribe` приезжает другой, и React
 * отписывается от опроса.
 */
const subscribeIdle = (): (() => void) => () => {}

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
  const deadline = deadlineAt === null ? Number.NaN : Date.parse(deadlineAt)
  const isCounting = !Number.isNaN(deadline) && deadline > Date.now()

  const nowSeconds = useSyncExternalStore(
    isCounting ? subscribe : subscribeIdle,
    getSnapshot,
    getServerSnapshot
  )

  if (nowSeconds === 0) {
    return { ...EXPIRED, isExpired: false, isReady: false }
  }

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
