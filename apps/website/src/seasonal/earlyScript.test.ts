// Запуск: npx vitest run src/seasonal/earlyScript.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { buildNewYearEarlyScript } from './earlyScript'
import { getDecorMode, getDecorWindow, isNewYearActive, NEWYEAR_ATTRIBUTE } from './season'

/** Прогоняет скрипт с поддельными `Date.now()` и `document`; возвращает, поставил ли он атрибут. */
const runScript = (script: string, at: Date): boolean => {
  const attributes: string[] = []
  const FakeDate = class extends Date {
    static override now(): number {
      return at.getTime()
    }
  }
  const fakeDocument = {
    documentElement: { setAttribute: (name: string): number => attributes.push(name) },
  }
  new Function('Date', 'document', script)(FakeDate, fakeDocument)
  return attributes.includes(NEWYEAR_ATTRIBUTE)
}

const bishkek = (iso: string): Date => new Date(`${iso}+06:00`)

/** Каждые 6 часов с 1 июля 2026 по 1 августа 2027: границы окна попадают в сетку. */
const grid = (): Date[] => {
  const dates: Date[] = []
  for (
    let t = Date.parse('2026-07-01T00:00:00+06:00');
    t < Date.parse('2027-08-01T00:00:00+06:00');
    t += 6 * 3_600_000
  ) {
    dates.push(new Date(t))
  }
  return dates
}

describe('ранний скрипт data-newyear', () => {
  afterEach(() => {
    delete process.env.NEW_YEAR_DECOR
    delete process.env.NEW_YEAR_START
    delete process.env.NEW_YEAR_END
  })

  it('ставит атрибут в окне и не ставит вне его (по умолчанию)', () => {
    const { start, end } = getDecorWindow()
    const script = buildNewYearEarlyScript(getDecorMode(), start, end)
    expect(runScript(script, bishkek('2026-11-27T23:59:00'))).toBe(false)
    expect(runScript(script, bishkek('2026-11-28T00:00:00'))).toBe(true)
    expect(runScript(script, bishkek('2027-01-15T23:59:00'))).toBe(true)
    expect(runScript(script, bishkek('2027-01-16T00:00:00'))).toBe(false)
  })

  it('on ставит всегда, off не ставит никогда', () => {
    expect(
      runScript(buildNewYearEarlyScript('on', 1201, 115), bishkek('2026-07-01T12:00:00'))
    ).toBe(true)
    expect(
      runScript(buildNewYearEarlyScript('off', 1201, 115), bishkek('2026-12-31T12:00:00'))
    ).toBe(false)
  })

  it.each([
    ['по умолчанию', {}],
    ['окно внутри года', { NEW_YEAR_START: '03-10', NEW_YEAR_END: '04-20' }],
    ['свои даты через Новый год', { NEW_YEAR_START: '12-15', NEW_YEAR_END: '01-10' }],
    ['on', { NEW_YEAR_DECOR: 'on' }],
    ['off', { NEW_YEAR_DECOR: 'off' }],
  ])('совпадает с isNewYearActive: %s', (_name, env) => {
    Object.assign(process.env, env)
    const { start, end } = getDecorWindow()
    const script = buildNewYearEarlyScript(getDecorMode(), start, end)
    for (const at of grid()) {
      expect(runScript(script, at), at.toISOString()).toBe(isNewYearActive(at))
    }
  })
})
