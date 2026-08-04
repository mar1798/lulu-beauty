import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneInput, formatNational, toE164, toNationalDigits } from '.'
import { renderWidget } from '../../testing/render'

/**
 * Главное здесь — нормализация: бэкенд принимает только E.164
 * (`^\+[1-9]\d{7,14}$`), а пользователь вводит номер как привык.
 */
describe('toNationalDigits', () => {
  it.each([
    ['0555123456', '555123456'],
    ['996555123456', '555123456'],
    ['+996 555 12 34 56', '555123456'],
    ['555123456', '555123456'],
    ['555-12-34-56', '555123456'],
  ])('%s → %s', (raw, expected) => {
    expect(toNationalDigits(raw)).toBe(expected)
  })

  it('обрезает лишние цифры', () => {
    expect(toNationalDigits('5551234567890')).toBe('555123456')
  })
})

describe('toE164', () => {
  it('собирает номер в вид, который принимает бэкенд', () => {
    expect(toE164('0555123456')).toBe('+996555123456')
    expect(toE164('+996555123456')).toMatch(/^\+[1-9]\d{7,14}$/)
  })

  it('отдаёт пустую строку, а не голый код страны', () => {
    expect(toE164('')).toBe('')
    expect(toE164('+996')).toBe('')
  })

  it('уважает другой код страны', () => {
    expect(toE164('701123456', '77')).toBe('+77701123456')
  })

  it('обрезает национальную часть до девяти цифр независимо от кода страны', () => {
    // Осознанное ограничение: поле рассчитано на кыргызстанские номера.
    expect(toE164('7011234567', '77')).toBe('+77701123456')
  })
})

describe('formatNational', () => {
  it('разбивает номер на группы 3-2-2-2', () => {
    expect(formatNational('555123456')).toBe('555 12 34 56')
  })

  it('не дописывает пустые группы при частичном вводе', () => {
    expect(formatNational('5551')).toBe('555 1')
  })
})

describe('PhoneInput', () => {
  it('показывает код страны отдельно от значения', () => {
    renderWidget(<PhoneInput value="+996555123456" onChange={vi.fn()} label="Телефон" />)

    expect(screen.getByLabelText('Телефон')).toHaveValue('555 12 34 56')
    expect(screen.getByText('+996')).toBeInTheDocument()
  })

  it('отдаёт наружу E.164, что бы ни набрали', async () => {
    const onChange = vi.fn()

    renderWidget(<PhoneInput value="" onChange={onChange} label="Телефон" />)
    await userEvent.type(screen.getByLabelText('Телефон'), '5')

    expect(onChange).toHaveBeenLastCalledWith('+9965')
  })
})
