/**
 * Чистка текста из полей профиля — та же, что делает бэкенд
 * (`apps/api/app/common/text.py`). Повторена здесь, чтобы форма отправляла и
 * показывала ровно то, что сохранится: иначе после сохранения в поле остаётся
 * «сырой» текст, сервер возвращает очищенный, и форма считает себя изменённой —
 * «Сохранить» горит, подтверждения нет, хотя всё сохранилось.
 */

/** Управляющие символы, кроме пробельных: их бэкенд выбрасывает. */
const CONTROL_PATTERN = /\p{Cc}/gu

/** Разделители строк `str.splitlines()` в Python — по ним режет и бэкенд. */
const LINE_BREAK_PATTERN = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/

/** Одна строка: любые пробелы и переносы — один пробел, края обрезаны (`single_line`). */
export const singleLine = (value: string): string =>
  value
    .replace(CONTROL_PATTERN, char => (/\s/.test(char) ? ' ' : ''))
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')

/** Переносы сохранены, каждая строка — как `singleLine`, пустые строки выброшены (`multi_line`). */
export const multiLine = (value: string): string =>
  value.split(LINE_BREAK_PATTERN).map(singleLine).filter(Boolean).join('\n')
