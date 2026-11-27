import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IOrder } from 'widgets/types'
import { ApiError } from '@/services/apiErrors'
import { addMyOrderPromoCode } from '@/services/endpoints/orders'
import { useOrderPromoCode } from './useOrderPromoCode'

vi.mock('@/services/endpoints/orders', () => ({ addMyOrderPromoCode: vi.fn() }))
vi.mock('@/services/endpoints/cart', () => ({ checkPromoCode: vi.fn() }))

const mocked = vi.mocked(addMyOrderPromoCode)
const updated = { id: 'order', revision: 4 } as IOrder
const onApplied = vi.fn()
const onRefused = vi.fn()

const render = (): { current: ReturnType<typeof useOrderPromoCode> } =>
  renderHook(() => useOrderPromoCode({ id: 'order', revision: 3 }, { onApplied, onRefused })).result

beforeEach(() => {
  mocked.mockReset()
  onApplied.mockReset()
  onRefused.mockReset()
})

describe('useOrderPromoCode', () => {
  it('применяет нормализованный код с revision заявки и отдаёт её ответ', async () => {
    mocked.mockResolvedValue(updated)
    const result = render()

    act(() => result.current.setValue('  ab12cd34 '))
    await act(() => result.current.apply())

    expect(mocked).toHaveBeenCalledWith('order', 3, 'AB12CD34')
    expect(onApplied).toHaveBeenCalledWith(updated)
    expect(result.current.value).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('код из списка применяется сам, без ввода', async () => {
    mocked.mockResolvedValue(updated)
    const result = render()

    await act(() => result.current.apply('K7M2XQ9R'))

    expect(mocked).toHaveBeenCalledWith('order', 3, 'K7M2XQ9R')
  })

  it('отказ остаётся под полем вместе с кодом, заявка перечитывается', async () => {
    mocked.mockRejectedValue(new ApiError(409, 'promo_code_conditions_not_met'))
    const result = render()

    await act(() => result.current.apply('K7M2XQ9R'))

    expect(result.current.error).toBe('Состав заявки не подходит под условия промокода.')
    expect(result.current.value).toBe('K7M2XQ9R')
    expect(onRefused).toHaveBeenCalledTimes(1)
    expect(onApplied).not.toHaveBeenCalled()

    act(() => result.current.setValue('K7M2XQ9'))
    expect(result.current.error).toBeNull()
  })

  it('пустое поле ничего не отправляет', async () => {
    const result = render()

    await act(() => result.current.apply())

    expect(mocked).not.toHaveBeenCalled()
  })
})
