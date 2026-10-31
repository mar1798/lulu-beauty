/**
 * Цена в поле ввода: владелец набирает сомы, бэкенд хранит копейки.
 *
 * Общее для форм админки — товара и пункта чек-листа, чтобы «1250,50» везде
 * значило одно и то же.
 */

const CENTS = 100

/** `MAX_PRICE_CENTS` бэкенда, в сомах: дальше не проходит 32-битная колонка. */
export const MAX_PRICE = 20_000_000

/** Знаков после разделителя в цене: копейки, и только они. */
const PRICE_FRACTION_DIGITS = 2

export const priceToInput = (priceCents: number): string =>
  priceCents % CENTS === 0 ? String(priceCents / CENTS) : (priceCents / CENTS).toFixed(2)

/**
 * Что способно попасть в поле цены: цифры, один разделитель и не больше двух
 * знаков после него — ровно то, что принимает `parsePrice`. Запятая остаётся
 * запятой: на русской раскладке набирают именно её.
 *
 * Поле не `type="number"`: браузер пускает туда «e», знак и экспоненту, а React
 * на таком вводе получает пустую строку и молча стирает уже набранное.
 */
export const priceOnly = (value: string): string => {
  const cleaned = value.replace(/[^\d.,]/g, '')
  const separator = cleaned.search(/[.,]/)

  if (separator === -1) {
    return cleaned
  }

  const fraction = cleaned
    .slice(separator + 1)
    .replace(/\D/g, '')
    .slice(0, PRICE_FRACTION_DIGITS)

  return `${cleaned.slice(0, separator)}${cleaned[separator]}${fraction}`
}

/** «1 250,50» и «1250.5» — одно и то же, в копейках; `null`, если это не число. */
export const parsePrice = (value: string): number | null => {
  const normalized = value.replace(/\s/g, '').replace(',', '.')

  if (normalized === '' || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  return Math.round(Number(normalized) * CENTS)
}

/** Потолок цены в копейках — для сравнения с результатом `parsePrice`. */
export const MAX_PRICE_CENTS = MAX_PRICE * CENTS
