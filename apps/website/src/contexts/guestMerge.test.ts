import { createElement, type ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ICart, IWishlist } from 'widgets/types'
import { ApiError } from '@/services/apiErrors'
import { addCartItem, getCart, mergeCart, previewCart } from '@/services/endpoints/cart'
import { getWishlist, mergeWishlist } from '@/services/endpoints/wishlist'
import { readGuestState, writeGuestCart, writeGuestWishlist } from '@/utils/guestStorage'
import { CartProvider, useCart } from './CartContext'
import { WishlistProvider, useWishlist } from './WishlistContext'

/*
  Гостевая корзина и избранное: перенос в аккаунт после входа и решение «гость или
  нет» в момент нажатия. Это то, что типы не ловят: гонки между ответами сервера и
  записью в хранилище браузера.
*/

interface IAuthState {
  user: { id: string } | null
  isLoading: boolean
  reload: () => Promise<{ id: string } | null>
}

const auth: IAuthState = { user: null, isLoading: false, reload: vi.fn() }

vi.mock('./AuthContext', () => ({ useAuth: (): IAuthState => auth }))

vi.mock('next/router', () => ({
  useRouter: () => ({ events: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/services/endpoints/cart', () => ({
  addCartItem: vi.fn(),
  emptyCart: vi.fn(),
  getCart: vi.fn(),
  mergeCart: vi.fn(),
  previewCart: vi.fn(),
  removeCartItem: vi.fn(),
  updateCartItem: vi.fn(),
}))

vi.mock('@/services/endpoints/wishlist', () => ({
  addWishlistItem: vi.fn(),
  getWishlist: vi.fn(),
  mergeWishlist: vi.fn(),
  previewWishlist: vi.fn(),
  removeWishlistItem: vi.fn(),
}))

const USER = { id: 'user-1' }
const CYCLE = 'cycle-1'

const emptyCart = (cycleId: string | null = CYCLE): ICart => ({
  cycleId,
  cycleDeadlineAt: null,
  items: [],
  totalCents: 0,
})

const line = (variantId: string, quantity = 1): ICart['items'][number] =>
  ({
    variantId,
    productId: `p-${variantId}`,
    productSlug: variantId,
    productName: variantId,
    productImageUrl: null,
    productPriceCents: 100,
    quantity,
    lineTotalCents: 100 * quantity,
  }) as ICart['items'][number]

const EMPTY_WISHLIST: IWishlist = { items: [] }

const wrapper = ({ children }: { children: ReactNode }): ReactNode =>
  createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    createElement(CartProvider, null, createElement(WishlistProvider, null, children))
  )

interface IDeferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: unknown) => void
}

const deferred = <T>(): IDeferred<T> => {
  let resolve: (value: T) => void = () => undefined
  let reject: (cause: unknown) => void = () => undefined
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })

  return { promise, resolve, reject }
}

beforeEach(() => {
  auth.user = null
  auth.isLoading = false
  auth.reload = vi.fn()
  vi.mocked(getCart).mockResolvedValue(emptyCart())
  vi.mocked(getWishlist).mockResolvedValue(EMPTY_WISHLIST)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('гостевая корзина', () => {
  it('кладёт новый объём в браузер после проверки по каталогу', async () => {
    vi.mocked(previewCart).mockResolvedValue({ ...emptyCart(), items: [line('v1')] })
    const { result } = renderHook(() => useCart(), { wrapper })

    let outcome: Awaited<ReturnType<typeof result.current.addItem>> | undefined

    await act(async () => {
      outcome = await result.current.addItem('v1')
    })

    expect(outcome).toEqual({ ok: true, error: null })
    expect(readGuestState().cart).toEqual({
      cycleId: CYCLE,
      lines: [{ variantId: 'v1', productId: 'p-v1', quantity: 1 }],
    })
  })

  it('не кладёт ничего, когда сбор закрыт', async () => {
    vi.mocked(previewCart).mockResolvedValue({ ...emptyCart(null), items: [line('v1')] })
    const { result } = renderHook(() => useCart(), { wrapper })

    let outcome: Awaited<ReturnType<typeof result.current.addItem>> | undefined

    await act(async () => {
      outcome = await result.current.addItem('v1')
    })

    expect(outcome?.ok).toBe(false)
    expect(readGuestState().cart.lines).toEqual([])
  })

  it('два быстрых нажатия на один объём дают одну строку, а не две', async () => {
    const first = deferred<ICart>()
    vi.mocked(previewCart)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ ...emptyCart(), items: [line('v1')] })
    const { result } = renderHook(() => useCart(), { wrapper })

    await act(async () => {
      const pending = result.current.addItem('v1')
      await result.current.addItem('v1')
      first.resolve({ ...emptyCart(), items: [line('v1')] })
      await pending
    })

    expect(readGuestState().cart.lines).toEqual([
      { variantId: 'v1', productId: 'p-v1', quantity: 2 },
    ])
  })

  it('пустая корзина гостя не ходит на сервер', async () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    await waitFor(() => expect(result.current.cart).not.toBeNull())

    expect(result.current.cart?.items).toEqual([])
    expect(previewCart).not.toHaveBeenCalled()
  })
})

describe('нажатие до ответа /api/auth/me', () => {
  it('у вошедшего уходит в его корзину, а не в «проверяем сессию»', async () => {
    auth.isLoading = true
    auth.reload = vi.fn().mockResolvedValue(USER)
    vi.mocked(addCartItem).mockResolvedValue({ ...emptyCart(), items: [line('v1')] })
    const { result } = renderHook(() => useCart(), { wrapper })

    let outcome: Awaited<ReturnType<typeof result.current.addItem>> | undefined

    await act(async () => {
      outcome = await result.current.addItem('v1')
    })

    expect(outcome).toEqual({ ok: true, error: null })
    expect(addCartItem).toHaveBeenCalledWith('v1', 1)
    expect(previewCart).not.toHaveBeenCalled()
  })
})

describe('перенос после входа', () => {
  it('отправляет сбор корзины и убирает из браузера только отправленное', async () => {
    writeGuestCart({ cycleId: CYCLE, lines: [{ variantId: 'a', productId: 'pa', quantity: 2 }] })
    auth.user = USER
    const firstMerge = deferred<ICart>()
    vi.mocked(mergeCart)
      .mockReturnValueOnce(firstMerge.promise)
      .mockResolvedValue({ ...emptyCart(), items: [line('a'), line('b')] })

    renderHook(() => useCart(), { wrapper })

    await waitFor(() => expect(mergeCart).toHaveBeenCalledTimes(1))
    expect(mergeCart).toHaveBeenLastCalledWith([{ variantId: 'a', quantity: 2 }], CYCLE)

    // Пока перенос в пути, соседняя вкладка дописала строку.
    act(() => {
      const { cart } = readGuestState()
      writeGuestCart({
        ...cart,
        lines: [...cart.lines, { variantId: 'b', productId: 'pb', quantity: 1 }],
      })
    })

    await act(async () => {
      firstMerge.resolve({ ...emptyCart(), items: [line('a', 2)] })
      await firstMerge.promise
    })

    // Дописанное не стёрто, а перенесено следующим заходом.
    await waitFor(() => expect(mergeCart).toHaveBeenCalledTimes(2))
    expect(mergeCart).toHaveBeenLastCalledWith([{ variantId: 'b', quantity: 1 }], CYCLE)
    await waitFor(() => expect(readGuestState().cart.lines).toEqual([]))
  })

  it('корзина прошлого сбора уезжает в избранное и об этом говорится', async () => {
    writeGuestCart({ cycleId: 'old', lines: [{ variantId: 'a', productId: 'pa', quantity: 1 }] })
    auth.user = USER
    vi.mocked(mergeCart).mockRejectedValue(new ApiError(409, 'cart_cycle_changed'))
    vi.mocked(mergeWishlist).mockReturnValue(new Promise<IWishlist>(() => undefined))

    const { result } = renderHook(() => useCart(), { wrapper })

    await waitFor(() => expect(result.current.error).toMatch(/избранное/))
    expect(readGuestState().cart.lines).toEqual([])
    expect(readGuestState().wishlist.map(item => item.productId)).toEqual(['pa'])
  })

  it('товары, легшие в избранное во время его переноса, не теряются', async () => {
    writeGuestWishlist([{ productId: 'saved', addedAt: '2026-11-01T00:00:00.000Z' }])
    auth.user = USER
    const firstMerge = deferred<IWishlist>()
    vi.mocked(mergeWishlist)
      .mockReturnValueOnce(firstMerge.promise)
      .mockResolvedValue(EMPTY_WISHLIST)

    renderHook(() => useWishlist(), { wrapper })

    await waitFor(() => expect(mergeWishlist).toHaveBeenCalledWith(['saved']))

    // Корзина закрывшегося сбора приехала в избранное, пока перенос был в пути.
    act(() => {
      writeGuestWishlist([
        { productId: 'rescued', addedAt: '2026-11-02T00:00:00.000Z' },
        ...readGuestState().wishlist,
      ])
    })

    await act(async () => {
      firstMerge.resolve(EMPTY_WISHLIST)
      await firstMerge.promise
    })

    await waitFor(() => expect(mergeWishlist).toHaveBeenLastCalledWith(['rescued']))
    await waitFor(() => expect(readGuestState().wishlist).toEqual([]))
  })
})
