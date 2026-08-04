import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCountdown } from './useCountdown'

/**
 * Дедлайн — единственное, что отделяет «можно оформить заявку» от «поздно»,
 * поэтому арифметика и переход через ноль проверяются явно.
 */

const NOW = new Date('2026-08-04T12:00:00.000Z')

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const inFuture = (ms: number): string => new Date(NOW.getTime() + ms).toISOString()

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('раскладывает остаток на дни, часы, минуты и секунды', () => {
    const { result } = renderHook(() => useCountdown(inFuture(2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND)))

    expect(result.current).toMatchObject({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      isExpired: false,
      isReady: true,
    })
  })

  it('тикает раз в секунду', () => {
    const { result } = renderHook(() => useCountdown(inFuture(10 * SECOND)))

    expect(result.current.seconds).toBe(10)

    act(() => {
      vi.advanceTimersByTime(3 * SECOND)
    })

    expect(result.current.seconds).toBe(7)
  })

  it('переходит в «истёк» ровно на дедлайне', () => {
    const { result } = renderHook(() => useCountdown(inFuture(2 * SECOND)))

    expect(result.current.isExpired).toBe(false)

    act(() => {
      vi.advanceTimersByTime(2 * SECOND)
    })

    expect(result.current.isExpired).toBe(true)
  })

  it('считает истёкшим прошедший дедлайн', () => {
    const { result } = renderHook(() => useCountdown(inFuture(-HOUR)))

    expect(result.current.isExpired).toBe(true)
  })

  it('переживает отсутствие сбора и битую дату', () => {
    expect(renderHook(() => useCountdown(null)).result.current.isExpired).toBe(true)
    expect(renderHook(() => useCountdown('не дата')).result.current.isExpired).toBe(true)
  })
})
