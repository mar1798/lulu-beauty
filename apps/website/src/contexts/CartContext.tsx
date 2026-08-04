import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ICart } from 'widgets/types'
import { isApiError } from '@/services/apiErrors'
import {
  addCartItem,
  emptyCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from '@/services/endpoints/cart'
import { useAuth } from './AuthContext'

/**
 * Корзина покупателя.
 *
 * Все ручки бэкенда возвращают корзину целиком, поэтому состояние не
 * пересчитывается на клиенте, а просто заменяется ответом — расхождение
 * между тем, что видит покупатель, и тем, что уйдёт в заявку, невозможно.
 *
 * Корзина существует только у авторизованного пользователя: для гостя это
 * `null`, а не пустой объект, — экран должен предложить войти, а не делать
 * вид, что корзина есть.
 */

export interface ICartContextValue {
  cart: ICart | null
  /** Сумма количеств — то, что показывает счётчик в шапке. */
  itemCount: number
  /** Первая загрузка корзины ещё идёт. */
  isLoading: boolean
  /** Идёт изменение: контролы блокируются, чтобы не отправить два запроса подряд. */
  isBusy: boolean
  error: string | null
  addItem: (productId: string, quantity?: number) => Promise<void>
  updateItem: (productId: string, quantity: number) => Promise<void>
  removeItem: (productId: string) => Promise<void>
  empty: () => Promise<void>
  reload: () => Promise<void>
  clearError: () => void
}

const CartContext = createContext<ICartContextValue | null>(null)

interface ILoadedCart {
  /** Чья это корзина: ответ на запрос предыдущего пользователя не должен пережить смену аккаунта. */
  userId: string
  cart: ICart | null
}

const messageOf = (cause: unknown, fallback: string): string =>
  isApiError(cause) ? cause.message : fallback

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [loaded, setLoaded] = useState<ILoadedCart | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isFresh = loaded !== null && loaded.userId === userId

  useEffect(() => {
    if (userId === null) {
      return
    }

    let isActive = true

    getCart()
      .then(result => {
        if (isActive) {
          setLoaded({ userId, cart: result })
        }
      })
      .catch((cause: unknown) => {
        if (isActive) {
          setLoaded({ userId, cart: null })
          setError(messageOf(cause, 'Не удалось загрузить корзину.'))
        }
      })

    return () => {
      isActive = false
    }
  }, [userId])

  /** Общая обёртка изменений: блокировка, замена состояния ответом, разбор ошибки. */
  const mutate = useCallback(
    async (action: () => Promise<ICart>, fallback: string): Promise<void> => {
      if (userId === null) {
        return
      }

      setIsBusy(true)
      setError(null)

      try {
        setLoaded({ userId, cart: await action() })
      } catch (cause: unknown) {
        setError(messageOf(cause, fallback))
      } finally {
        setIsBusy(false)
      }
    },
    [userId]
  )

  const addItem = useCallback(
    (productId: string, quantity = 1) =>
      mutate(() => addCartItem(productId, quantity), 'Не удалось добавить товар.'),
    [mutate]
  )

  const updateItem = useCallback(
    (productId: string, quantity: number) =>
      mutate(() => updateCartItem(productId, quantity), 'Не удалось изменить количество.'),
    [mutate]
  )

  const removeItem = useCallback(
    (productId: string) =>
      mutate(() => removeCartItem(productId), 'Не удалось убрать товар.'),
    [mutate]
  )

  const empty = useCallback(
    () => mutate(() => emptyCart(), 'Не удалось очистить корзину.'),
    [mutate]
  )

  const reload = useCallback(
    () => mutate(() => getCart(), 'Не удалось загрузить корзину.'),
    [mutate]
  )

  const clearError = useCallback(() => setError(null), [])

  const cart = userId === null || !isFresh ? null : loaded.cart

  const value = useMemo<ICartContextValue>(
    () => ({
      cart,
      itemCount: cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      isLoading: userId !== null && !isFresh,
      isBusy,
      error,
      addItem,
      updateItem,
      removeItem,
      empty,
      reload,
      clearError,
    }),
    [cart, userId, isFresh, isBusy, error, addItem, updateItem, removeItem, empty, reload, clearError]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = (): ICartContextValue => {
  const value = useContext(CartContext)

  if (value === null) {
    throw new Error('useCart вызван вне <CartProvider>')
  }

  return value
}
