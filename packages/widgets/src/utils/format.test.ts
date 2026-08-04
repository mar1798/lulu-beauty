import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './datetime'
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
