// Запуск: npx vitest run src/seasonal/season.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { isNewYearActive } from './season'

// Время в Бишкеке = UTC+6
const bishkek = (iso: string): Date => new Date(`${iso}+06:00`)

describe('isNewYearActive', () => {
  afterEach(() => {
    delete process.env.NEW_YEAR_DECOR
    delete process.env.NEW_YEAR_START
    delete process.env.NEW_YEAR_END
  })

  it('выключено 27 ноября 23:59', () =>
    expect(isNewYearActive(bishkek('2026-11-27T23:59:00'))).toBe(false))
  it('включено 28 ноября 00:00', () =>
    expect(isNewYearActive(bishkek('2026-11-28T00:00:00'))).toBe(true))
  it('включено 31 декабря', () =>
    expect(isNewYearActive(bishkek('2026-12-31T12:00:00'))).toBe(true))
  it('включено 15 января 23:59', () =>
    expect(isNewYearActive(bishkek('2027-01-15T23:59:00'))).toBe(true))
  it('выключено 16 января 00:00', () =>
    expect(isNewYearActive(bishkek('2027-01-16T00:00:00'))).toBe(false))

  it('on - включено летом', () => {
    process.env.NEW_YEAR_DECOR = 'on'
    expect(isNewYearActive(bishkek('2026-07-01T12:00:00'))).toBe(true)
  })
  it('off - выключено 31 декабря', () => {
    process.env.NEW_YEAR_DECOR = 'off'
    expect(isNewYearActive(bishkek('2026-12-31T12:00:00'))).toBe(false)
  })
  it('свои даты', () => {
    process.env.NEW_YEAR_START = '12-15'
    process.env.NEW_YEAR_END = '01-10'
    expect(isNewYearActive(bishkek('2026-12-10T12:00:00'))).toBe(false)
    expect(isNewYearActive(bishkek('2027-01-10T12:00:00'))).toBe(true)
  })
})
