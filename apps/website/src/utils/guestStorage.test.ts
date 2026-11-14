import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_ITEM_QUANTITY,
  readGuestState,
  rescueGuestCart,
  writeGuestCart,
  writeGuestWishlist,
} from './guestStorage'

const CART_KEY = 'sululu:guest-cart'
const WISHLIST_KEY = 'sululu:guest-wishlist'

afterEach(() => {
  window.localStorage.clear()
})

describe('guestStorage', () => {
  it('пустое хранилище - пустая корзина и пустое избранное', () => {
    expect(readGuestState()).toEqual({ cart: { cycleId: null, lines: [] }, wishlist: [] })
  })

  it('битые данные не роняют разбор, а отбрасываются построчно', () => {
    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        cycleId: 'c1',
        lines: [
          { variantId: 'v1', productId: 'p1', quantity: 2 },
          { variantId: 'v2', productId: 'p2', quantity: 0 },
          { variantId: 'v3', quantity: 1 },
          'мусор',
          { variantId: 'v4', productId: 'p4', quantity: 5000 },
        ],
      })
    )
    window.localStorage.setItem(WISHLIST_KEY, '{не json')

    expect(readGuestState()).toEqual({
      cart: {
        cycleId: 'c1',
        lines: [
          { variantId: 'v1', productId: 'p1', quantity: 2 },
          { variantId: 'v4', productId: 'p4', quantity: MAX_ITEM_QUANTITY },
        ],
      },
      wishlist: [],
    })
  })

  it('отдаёт тот же снимок, пока хранилище не менялось', () => {
    writeGuestCart({ cycleId: 'c1', lines: [{ variantId: 'v1', productId: 'p1', quantity: 1 }] })

    expect(readGuestState()).toBe(readGuestState())
  })

  it('пустая корзина убирает ключ из хранилища целиком', () => {
    writeGuestCart({ cycleId: 'c1', lines: [{ variantId: 'v1', productId: 'p1', quantity: 1 }] })
    writeGuestCart({ cycleId: 'c1', lines: [] })

    expect(window.localStorage.getItem(CART_KEY)).toBeNull()
  })

  it('переносит корзину в избранное, схлопывая объёмы и не дублируя сохранённое', () => {
    writeGuestWishlist([{ productId: 'p2', addedAt: '2026-11-01T00:00:00.000Z' }])
    writeGuestCart({
      cycleId: 'c1',
      lines: [
        { variantId: 'v1a', productId: 'p1', quantity: 1 },
        { variantId: 'v1b', productId: 'p1', quantity: 3 },
        { variantId: 'v2', productId: 'p2', quantity: 1 },
      ],
    })

    rescueGuestCart()

    const { cart, wishlist } = readGuestState()

    expect(cart.lines).toEqual([])
    expect(wishlist.map(item => item.productId)).toEqual(['p1', 'p2'])
  })
})
