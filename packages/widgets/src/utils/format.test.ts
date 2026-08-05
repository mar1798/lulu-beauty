import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatMonth,
  shiftMonth,
  storeIso,
  storeOffsetLabel,
  toStoreParts,
} from './datetime'
import { plural, pluralize } from './plural'

/**
 * Форматирование данных заявки: склонения и даты.
 *
 * Дату проверяем на конкретном UTC-моменте: пояс зашит в модуль (`Asia/Bishkek`),
 * и тест обязан ловить случайный переход на пояс машины — иначе SSR и клиент
 * начнут показывать разное время закрытия сбора.
 */

const FORMS = ['позиция', 'позиции', 'позиций'] as const

describe('plural', () => {
  it('склоняет по правилам русского языка', () => {
    expect(plural(1, FORMS)).toBe('позиция')
    expect(plural(2, FORMS)).toBe('позиции')
    expect(plural(5, FORMS)).toBe('позиций')
  })

  it('не путается на 11–14 и 21', () => {
    expect(plural(11, FORMS)).toBe('позиций')
    expect(plural(12, FORMS)).toBe('позиций')
    expect(plural(21, FORMS)).toBe('позиция')
    expect(plural(22, FORMS)).toBe('позиции')
  })

  it('считает ноль множественным', () => {
    expect(pluralize(0, FORMS)).toBe('0 позиций')
  })
})

describe('formatDateTime', () => {
  it('переводит UTC в Asia/Bishkek (+6)', () => {
    expect(formatDateTime('2026-08-04T13:32:10Z')).toBe('4 августа 2026 г. в 19:32')
  })

  it('переносит дату, когда в Бишкеке уже следующие сутки', () => {
    expect(formatDate('2026-08-04T20:00:00Z')).toBe('5 августа 2026 г.')
  })

  it('на неразбираемом значении отдаёт пустую строку, а не «Invalid Date»', () => {
    expect(formatDateTime('не дата')).toBe('')
    expect(formatDate('')).toBe('')
  })
})

describe('календарные величины магазина', () => {
  it('раскладывает мгновение на дату и время по Бишкеку', () => {
    expect(toStoreParts('2026-08-04T13:32:10Z')).toEqual({ date: '2026-08-04', time: '19:32' })
  })

  it('переносит дату, когда в Бишкеке уже следующие сутки', () => {
    expect(toStoreParts('2026-08-04T20:00:00Z')).toEqual({ date: '2026-08-05', time: '02:00' })
  })

  it('на неразбираемом значении отдаёт null, а не мусорные части', () => {
    expect(toStoreParts('не дата')).toBeNull()
  })

  it('переводит дату и время магазина обратно в мгновение', () => {
    expect(storeIso('2026-08-14', '20:00')).toBe('2026-08-14T14:00:00.000Z')
  })

  it('переживает круговой перевод', () => {
    const iso = storeIso('2026-12-31', '23:59')

    expect(toStoreParts(iso)).toEqual({ date: '2026-12-31', time: '23:59' })
  })

  it('на битом вводе отдаёт пустую строку', () => {
    expect(storeIso('', '20:00')).toBe('')
    expect(storeIso('2026-08-14', 'вечером')).toBe('')
  })

  it('показывает смещение целыми минутами', () => {
    // Остаток миллисекунд от Date.now() однажды превратил подпись
    // в «UTC+05:59.99021666666664».
    expect(storeOffsetLabel()).toMatch(/^[+-]\d{2}:\d{2}$/)
  })

  it('считает соседние месяцы через границу года', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('называет месяц по-русски', () => {
    expect(formatMonth('2026-08')).toBe('август 2026 г.')
  })
})
