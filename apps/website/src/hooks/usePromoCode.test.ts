import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPromoCodeCheck } from 'widgets/types'
import { ApiError } from '@/services/apiErrors'
import { checkPromoCode } from '@/services/endpoints/cart'
import { normalizeCodeInput, usePromoCode } from './usePromoCode'

vi.mock('@/services/endpoints/cart', () => ({ checkPromoCode: vi.fn() }))

const check = (code: string): IPromoCodeCheck => ({
  code: {
    id: code,
    code,
    status: 'ACTIVE',
    conditions: [],
    rewards: [],
    validFrom: '2026-01-01T00:00:00Z',
    expiresAt: '2027-01-01T00:00:00Z',
  },
  discountCents: 10_000,
  gifts: [],
  cartTotalCents: 100_000,
  payableCents: 90_000,
  promotions: {
    applied: [],
    hints: [],
    gifts: [],
    itemsDiscountCents: 0,
    orderDiscountCents: 10_000,
    discountCents: 10_000,
    payableCents: 90_000,
  },
})

const mocked = vi.mocked(checkPromoCode)
const settle = (): Promise<void> => Promise.resolve()

beforeEach(() => {
  mocked.mockReset()
})

describe('normalizeCodeInput', () => {
  it('убирает края и приводит к верхнему регистру', () => {
    expect(normalizeCodeInput('  ab12cd34 ')).toBe('AB12CD34')
  })
})

describe('usePromoCode', () => {
  it('принимает код: сервер проверяет нормализованную строку, ответ сохраняется целиком', async () => {
    mocked.mockResolvedValue(check('AB12CD34'))

    const { result } = renderHook(() => usePromoCode('a', settle))

    act(() => {
      result.current.setValue(' ab12cd34 ')
    })
    await act(async () => {
      await result.current.apply()
    })

    expect(mocked).toHaveBeenCalledWith('AB12CD34')
    expect(result.current.applied?.payableCents).toBe(90_000)
    expect(result.current.value).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('отказ сервера - текст из таблицы ошибок, код не применён', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'promo_code_not_found'))

    const { result } = renderHook(() => usePromoCode('a', settle))

    await act(async () => {
      await result.current.apply('zzzz0000')
    })

    expect(result.current.applied).toBeNull()
    expect(result.current.error).toMatch(/промокод/i)
    expect(result.current.value).toBe('ZZZZ0000')
  })

  it('пустой ввод сервер не дёргает', async () => {
    const { result } = renderHook(() => usePromoCode('a', settle))

    await act(async () => {
      await result.current.apply('   ')
    })

    expect(mocked).not.toHaveBeenCalled()
  })

  it('«Убрать» снимает код без запросов', async () => {
    mocked.mockResolvedValue(check('AB12CD34'))

    const { result } = renderHook(() => usePromoCode('a', settle))

    await act(async () => {
      await result.current.apply('ab12cd34')
    })
    act(() => {
      result.current.remove()
    })

    expect(result.current.applied).toBeNull()
    expect(mocked).toHaveBeenCalledOnce()
  })

  it('смена состава корзины перепроверяет принятый код и обновляет суммы', async () => {
    mocked.mockResolvedValueOnce(check('AB12CD34'))

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, settle), {
      initialProps: { signature: 'a' },
    })

    await act(async () => {
      await result.current.apply('ab12cd34')
    })

    mocked.mockResolvedValueOnce({ ...check('AB12CD34'), payableCents: 50_000 })
    rerender({ signature: 'b' })

    await waitFor(() => {
      expect(result.current.applied?.payableCents).toBe(50_000)
    })
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it('код, который перестал подходить, снимается с причиной', async () => {
    mocked.mockResolvedValueOnce(check('AB12CD34'))

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, settle), {
      initialProps: { signature: 'a' },
    })

    await act(async () => {
      await result.current.apply('ab12cd34')
    })

    mocked.mockRejectedValueOnce(new ApiError(409, 'promo_code_conditions_not_met'))
    rerender({ signature: 'b' })

    await waitFor(() => {
      expect(result.current.applied).toBeNull()
    })
    expect(result.current.error).not.toBeNull()
  })

  it('без принятого кода смена состава ничего не проверяет', () => {
    const { rerender } = renderHook(({ signature }) => usePromoCode(signature, settle), {
      initialProps: { signature: 'a' },
    })

    rerender({ signature: 'b' })

    expect(mocked).not.toHaveBeenCalled()
  })
})
