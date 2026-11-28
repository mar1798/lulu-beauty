/**
 * Новогодний режим Sululu.
 *
 * NEW_YEAR_DECOR:
 *   'auto' (по умолчанию) - включено с NEW_YEAR_START по NEW_YEAR_END включительно
 *   'on'                  - включено всегда (для превью на staging)
 *   'off'                 - выключено всегда (аварийный рубильник)
 *
 * NEW_YEAR_START / NEW_YEAR_END - формат 'MM-DD', по умолчанию '11-28' и '01-15'.
 * Окно может переходить через Новый год (11-28 → 01-15) - это учтено.
 * Даты считаются по времени Бишкека (UTC+6, без перехода на летнее время).
 *
 * Переменные не `NEXT_PUBLIC_`, но в клиентский бандл попадают: `next.config.js` вшивает их
 * через `env` при сборке. Менять режим можно только пересборкой образа.
 */

export type DecorMode = 'auto' | 'on' | 'off'

/** Атрибут на `<html>`: CSS резервирует по нему место под декор в первом кадре. */
export const NEWYEAR_ATTRIBUTE = 'data-newyear'

export const DEFAULT_START = '11-28'
export const DEFAULT_END = '01-15'

export const BISHKEK_OFFSET_MIN = 6 * 60

export function parseMonthDay(value: string | undefined, fallback: string): number {
  const v = (value ?? fallback).trim()
  const m = /^(\d{2})-(\d{2})$/.exec(v)
  if (!m) return parseMonthDay(undefined, fallback)
  return Number(m[1]) * 100 + Number(m[2]) // 12-01 -> 1201
}

function bishkekMonthDay(now: Date): number {
  const local = new Date(now.getTime() + BISHKEK_OFFSET_MIN * 60_000)
  return (local.getUTCMonth() + 1) * 100 + local.getUTCDate()
}

export function getDecorMode(): DecorMode {
  const raw = (process.env.NEW_YEAR_DECOR ?? 'auto').toLowerCase()
  return raw === 'on' || raw === 'off' ? raw : 'auto'
}

/** Окно показа в виде MMDD: `{ start: 1201, end: 115 }`. */
export function getDecorWindow(): { start: number; end: number } {
  return {
    start: parseMonthDay(process.env.NEW_YEAR_START, DEFAULT_START),
    end: parseMonthDay(process.env.NEW_YEAR_END, DEFAULT_END),
  }
}

export function isNewYearActive(now: Date = new Date()): boolean {
  const mode = getDecorMode()
  if (mode === 'on') return true
  if (mode === 'off') return false

  const { start, end } = getDecorWindow()
  const today = bishkekMonthDay(now)

  // окно внутри одного года (например 12-01 → 12-31)
  if (start <= end) return today >= start && today <= end
  // окно через Новый год (12-01 → 01-15)
  return today >= start || today <= end
}
