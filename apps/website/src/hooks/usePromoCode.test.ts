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

  it('вытесненная перепроверка не снимает код, даже если ответ пришёл последним', async () => {
    mocked.mockResolvedValueOnce(check('AB12CD34'))

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, settle), {
      initialProps: { signature: 'a' },
    })

    await act(async () => {
      await result.current.apply('ab12cd34')
    })

    let resolveFirst: (value: IPromoCodeCheck) => void = () => undefined
    let resolveSecond: (value: IPromoCodeCheck) => void = () => undefined

    mocked.mockReturnValueOnce(new Promise(resolve => (resolveFirst = resolve)))
    mocked.mockReturnValueOnce(new Promise(resolve => (resolveSecond = resolve)))
    rerender({ signature: 'b' })
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2))
    rerender({ signature: 'c' })
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(3))

    // Новая проверка отвечает первой, запоздавшая - после неё.
    await act(async () => {
      resolveSecond({ ...check('AB12CD34'), payableCents: 50_000 })
    })
    await act(async () => {
      resolveFirst({ ...check('AB12CD34'), payableCents: 70_000 })
    })

    expect(result.current.applied?.payableCents).toBe(50_000)
    expect(result.current.error).toBeNull()
  })

  it('«Убрать» во время ожидания корзины: перепроверка код не возвращает', async () => {
    mocked.mockResolvedValueOnce(check('AB12CD34'))

    let release: () => void = () => undefined
    let isHeld = false
    const wait = (): Promise<void> =>
      isHeld
        ? new Promise<void>(resolve => {
            release = resolve
          })
        : Promise.resolve()

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, wait), {
      initialProps: { signature: 'a' },
    })

    await act(async () => {
      await result.current.apply('ab12cd34')
    })

    isHeld = true
    rerender({ signature: 'b' })
    act(() => {
      result.current.remove()
    })
    await act(async () => {
      release()
    })

    expect(result.current.applied).toBeNull()
    expect(result.current.isChecking).toBe(false)
    expect(mocked).toHaveBeenCalledOnce()
  })

  it('«Убрать» и другой код во время ожидания корзины: остаётся выбранный человеком', async () => {
    mocked.mockResolvedValueOnce(check('AAAA0000'))

    const releases: Array<() => void> = []
    let isHeld = false
    const wait = (): Promise<void> =>
      isHeld
        ? new Promise<void>(resolve => {
            releases.push(resolve)
          })
        : Promise.resolve()

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, wait), {
      initialProps: { signature: 'a' },
    })

    await act(async () => {
      await result.current.apply('aaaa0000')
    })

    isHeld = true
    rerender({ signature: 'b' })
    act(() => {
      result.current.remove()
    })
    mocked.mockResolvedValueOnce(check('BBBB1111'))

    let applying: Promise<void> = Promise.resolve()

    act(() => {
      applying = result.current.apply('bbbb1111')
    })
    await act(async () => {
      releases.forEach(release => release())
      await applying
    })

    expect(result.current.applied?.code.code).toBe('BBBB1111')
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it('код, применённый сразу после «+», проверяется после того, как корзина догнала экран', async () => {
    mocked.mockResolvedValue(check('AB12CD34'))

    let release: () => void = () => undefined
    const wait = (): Promise<void> =>
      new Promise<void>(resolve => {
        release = resolve
      })

    const { result } = renderHook(() => usePromoCode('a', wait))

    let applying: Promise<void> = Promise.resolve()

    act(() => {
      applying = result.current.apply('ab12cd34')
    })
    expect(mocked).not.toHaveBeenCalled()

    await act(async () => {
      release()
      await applying
    })

    expect(mocked).toHaveBeenCalledOnce()
    expect(result.current.applied?.code.code).toBe('AB12CD34')
  })

  it('правка корзины во время ожидания не отменяет «Применить»: ждёт снова и проверяет по новой', async () => {
    mocked.mockResolvedValue(check('AB12CD34'))

    const releases: Array<() => void> = []
    const wait = (): Promise<void> =>
      new Promise<void>(resolve => {
        releases.push(resolve)
      })

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, wait), {
      initialProps: { signature: 'a' },
    })

    let applying: Promise<void> = Promise.resolve()

    act(() => {
      applying = result.current.apply('ab12cd34')
    })
    rerender({ signature: 'b' })
    await act(async () => {
      releases[0]()
    })
    expect(mocked).not.toHaveBeenCalled()
    expect(releases).toHaveLength(2)

    await act(async () => {
      releases[1]()
      await applying
    })

    expect(mocked).toHaveBeenCalledOnce()
    expect(result.current.applied?.code.code).toBe('AB12CD34')
  })

  it('правка корзины, пока идёт проверка введённого кода: старый ответ не принимается, проверка повторяется', async () => {
    let resolveFirst: (value: IPromoCodeCheck) => void = () => undefined

    mocked.mockReturnValueOnce(new Promise(resolve => (resolveFirst = resolve)))
    mocked.mockResolvedValueOnce({ ...check('AB12CD34'), payableCents: 50_000 })

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, settle), {
      initialProps: { signature: 'a' },
    })

    let applying: Promise<void> = Promise.resolve()

    act(() => {
      applying = result.current.apply('ab12cd34')
    })
    await waitFor(() => expect(mocked).toHaveBeenCalledOnce())
    rerender({ signature: 'b' })
    await act(async () => {
      resolveFirst(check('AB12CD34'))
      await applying
    })

    expect(mocked).toHaveBeenCalledTimes(2)
    expect(result.current.applied?.payableCents).toBe(50_000)
    expect(result.current.isChecking).toBe(false)
  })

  it('«Убрать» во время ожидания корзины при «Применить»: ничего не применяется', async () => {
    let release: () => void = () => undefined
    const wait = (): Promise<void> =>
      new Promise<void>(resolve => {
        release = resolve
      })

    const { result } = renderHook(() => usePromoCode('a', wait))

    let applying: Promise<void> = Promise.resolve()

    act(() => {
      applying = result.current.apply('ab12cd34')
    })
    act(() => {
      result.current.remove()
    })
    await act(async () => {
      release()
      await applying
    })

    expect(mocked).not.toHaveBeenCalled()
    expect(result.current.applied).toBeNull()
    expect(result.current.isChecking).toBe(false)
  })

  it('быстрые «+» подряд: перепроверка идёт один раз и по итоговой корзине', async () => {
    mocked.mockResolvedValueOnce(check('AB12CD34'))

    const releases: Array<() => void> = []
    let isHeld = false
    const wait = (): Promise<void> =>
      isHeld
        ? new Promise<void>(resolve => {
            releases.push(resolve)
          })
        : Promise.resolve()

    const { result, rerender } = renderHook(({ signature }) => usePromoCode(signature, wait), {
      initialProps: { signature: 'a' },
    })

    await act(async () => {
      await result.current.apply('ab12cd34')
    })

    isHeld = true
    mocked.mockResolvedValueOnce({ ...check('AB12CD34'), payableCents: 50_000 })
    rerender({ signature: 'b' })
    rerender({ signature: 'c' })
    expect(releases).toHaveLength(2)

    // Первый запрос корзины догнал экран, второй - ещё в пути: проверять рано.
    await act(async () => {
      releases[0]()
    })
    expect(mocked).toHaveBeenCalledTimes(1)

    await act(async () => {
      releases[1]()
    })
    await waitFor(() => expect(result.current.applied?.payableCents).toBe(50_000))
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it('без принятого кода смена состава ничего не проверяет', () => {
    const { rerender } = renderHook(({ signature }) => usePromoCode(signature, settle), {
      initialProps: { signature: 'a' },
    })

    rerender({ signature: 'b' })

    expect(mocked).not.toHaveBeenCalled()
  })
})
