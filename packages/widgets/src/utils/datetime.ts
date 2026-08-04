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

/** «4 августа 2026 г.»; пустая строка на неразбираемом значении. */
export const formatDate = (iso: string): string => {
  const date = new Date(iso)

  return isValid(date) ? new Intl.DateTimeFormat(LOCALE, DATE_OPTIONS).format(date) : ''
}

/** «4 августа 2026 г., 19:32». */
export const formatDateTime = (iso: string): string => {
  const date = new Date(iso)

  if (!isValid(date)) {
    return ''
  }

  return new Intl.DateTimeFormat(LOCALE, { ...DATE_OPTIONS, ...TIME_OPTIONS }).format(date)
}
