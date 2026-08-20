/**
 * Форматирование дат для интерфейса.
 *
 * Часовой пояс задан явно (`Asia/Bishkek`, как `CYCLE_TIMEZONE` в
 * `apps/api/app/config.py`), а не берётся из браузера: дедлайны сбора и даты
 * заявок — величины магазина, а не читателя. Иначе один и тот же сбор
 * выглядел бы закрывающимся в разное время у покупателя в отпуске и у
 * владельца, и SSR расходился бы с гидратацией.
 */

const TIME_ZONE = 'Asia/Bishkek'
const LOCALE = 'ru-RU'

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
}

const isValid = (value: Date): boolean => !Number.isNaN(value.getTime())

/*
  Форматтеры создаются один раз на модуль, а не на вызов.

  `new Intl.DateTimeFormat(...)` — самая дорогая часть форматирования: замер на
  node 22 даёт 31.7 мкс против 0.59 мкс при переиспользовании (`formatToParts` —
  37.0 против 4.8). А зовут их построчно: таблица заявок, таблица аккаунтов,
  карточка заявки, календарь сборов — каждая строка списка.
*/
const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, DATE_OPTIONS)
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, { ...DATE_OPTIONS, ...TIME_OPTIONS })
const MONTH_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
})

/** «4 августа 2026 г.»; пустая строка на неразбираемом значении. */
export const formatDate = (iso: string): string => {
  const date = new Date(iso)

  return isValid(date) ? DATE_FORMAT.format(date) : ''
}

/** «4 августа 2026 г., 19:32». */
export const formatDateTime = (iso: string): string => {
  const date = new Date(iso)

  if (!isValid(date)) {
    return ''
  }

  return DATE_TIME_FORMAT.format(date)
}

/* ------------------------------------------------------------------ *
 * Календарные величины магазина.
 *
 * Календарь дедлайнов оперирует не мгновениями, а датой и временем «по
 * магазину»: владелец назначает сбор на «14 августа, 20:00» в Бишкеке,
 * а бэкенду нужен ISO-мгновение. Обе стороны перевода живут здесь, чтобы
 * смещение считалось одним способом.
 * ------------------------------------------------------------------ */

const PARTS_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

const PARTS_FORMAT = new Intl.DateTimeFormat('en-GB', PARTS_OPTIONS)

interface IStoreParts {
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM`. */
  time: string
}

const partsOf = (date: Date): Record<string, string> => {
  const result: Record<string, string> = {}

  for (const part of PARTS_FORMAT.formatToParts(date)) {
    result[part.type] = part.value
  }

  return result
}

/** Мгновение → дата и время в таймзоне магазина. */
export const toStoreParts = (iso: string): IStoreParts | null => {
  const date = new Date(iso)

  if (!isValid(date)) {
    return null
  }

  const parts = partsOf(date)
  // `hour12: false` в некоторых движках даёт «24» вместо «00» для полуночи.
  const hour = parts.hour === '24' ? '00' : parts.hour

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  }
}

const MINUTE_MS = 60 * 1000

/**
 * Смещение таймзоны магазина в миллисекундах для конкретного мгновения.
 * Считается через `Intl`, а не константой `+06:00`: константа врёт, если
 * магазин однажды переедет в зону с переводом часов.
 */
const offsetAt = (utcMs: number): number => {
  const parts = partsOf(new Date(utcMs))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )

  return asUtc - utcMs
}

/**
 * Дата и время «по магазину» → ISO-мгновение для бэкенда.
 *
 * Смещение уточняется вторым проходом: первый берёт его для неверного
 * мгновения, и на переводе часов ошибся бы на час. Пустая строка — если
 * дата или время не разбираются.
 */
export const storeIso = (date: string, time: string): string => {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)

  if ([year, month, day, hour, minute].some(part => !Number.isFinite(part))) {
    return ''
  }

  const wallMs = Date.UTC(year, month - 1, day, hour, minute)
  const firstGuess = wallMs - offsetAt(wallMs)
  const exact = wallMs - offsetAt(firstGuess)

  return new Date(exact).toISOString()
}

/** «август 2026» для заголовка календаря; на входе `YYYY-MM`. */
export const formatMonth = (month: string): string => {
  const date = new Date(`${month}-01T12:00:00Z`)

  if (!isValid(date)) {
    return ''
  }

  return MONTH_FORMAT.format(date)
}

/** Соседний месяц: `shiftMonth('2026-01', -1) === '2025-12'`. */
export const shiftMonth = (month: string, delta: number): string => {
  const [year, index] = month.split('-').map(Number)

  if (!Number.isFinite(year) || !Number.isFinite(index)) {
    return month
  }

  const shifted = new Date(Date.UTC(year, index - 1 + delta, 1))

  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Текущие дата и месяц по магазину. Только для серверного/клиентского кода, не для рендера. */
export const storeToday = (): IStoreParts & { month: string } => {
  const parts = toStoreParts(new Date().toISOString()) ?? { date: '', time: '' }

  return { ...parts, month: parts.date.slice(0, 'YYYY-MM'.length) }
}

/** Смещение таймзоны магазина, `+06:00` — для подписи под полем времени. */
export const storeOffsetLabel = (): string => {
  /*
    Округление обязательно: `offsetAt` сравнивает мгновение с разложением до
    секунд, поэтому на «сыром» `Date.now()` остаток миллисекунд превращал
    подпись в «UTC+05:59.99021666666664».
  */
  const minutes = Math.round(offsetAt(Date.now()) / MINUTE_MS)
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)

  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}
