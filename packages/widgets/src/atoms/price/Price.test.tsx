import { describe, expect, it } from 'vitest'
import { formatPrice } from '.'

/**
 * `Intl.NumberFormat('ru-RU')` разделяет разряды неразрывным пробелом,
 * причём в разных версиях ICU это то U+00A0, то U+202F. Сравнивать посимвольно
 * бессмысленно, поэтому любые пробельные символы нормализуются к обычному.
 */
const normalize = (value: string): string => value.replace(/\s/gu, ' ')

describe('formatPrice', () => {
  it('переводит копейки в сомы и группирует разряды', () => {
    expect(normalize(formatPrice(125_000))).toBe('1 250 сом')
  })

  it('не показывает дробную часть у круглой цены', () => {
    expect(normalize(formatPrice(1900))).toBe('19 сом')
  })

  it('показывает копейки, когда они есть', () => {
    expect(normalize(formatPrice(1999))).toBe('19,99 сом')
  })

  it('корректно печатает ноль', () => {
    expect(normalize(formatPrice(0))).toBe('0 сом')
  })

  it('позволяет заменить единицу', () => {
    expect(normalize(formatPrice(50_000, '₸'))).toBe('500 ₸')
  })
})
