import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import useSWR from 'swr'
import type { ICart } from 'widgets/types'
import { isApiError } from '@/services/apiErrors'
import { cartKey } from '@/services/swrKeys'
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
  /*
   * Изменения возвращают признак успеха (`false` — не вышло, и `error` уже
   * заполнен). Нужен он прежде всего кнопке «в корзину» в карточке: она
   * единственная живёт вне экрана корзины, где ошибку никто не показывает,
   * и должна сама сообщить о провале.
   */
  addItem: (productId: string, quantity?: number) => Promise<boolean>
  updateItem: (productId: string, quantity: number) => Promise<boolean>
  removeItem: (productId: string) => Promise<boolean>
  empty: () => Promise<boolean>
  reload: () => Promise<boolean>
  clearError: () => void
}

const CartContext = createContext<ICartContextValue | null>(null)

const messageOf = (cause: unknown, fallback: string): string =>
  isApiError(cause) ? cause.message : fallback

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    mutate: swrMutate,
  } = useSWR<ICart>(userId === null ? null : cartKey(userId), getCart)

  /**
   * Общая обёртка изменений: блокировка, замена кеша ответом, разбор ошибки.
   * Возвращает, удалось ли изменение, — вызывающему не нужно ждать, пока
   * `error` доедет до него отдельным рендером.
   */
  const runMutation = useCallback(
    async (action: () => Promise<ICart>, fallback: string): Promise<boolean> => {
      if (userId === null) {
        return false
      }

      setIsBusy(true)
      setError(null)

      try {
        await swrMutate(action(), { revalidate: false })

        return true
      } catch (cause: unknown) {
        setError(messageOf(cause, fallback))

        return false
      } finally {
        setIsBusy(false)
      }
    },
    [userId, swrMutate]
  )

  const addItem = useCallback(
    (productId: string, quantity = 1) =>
      runMutation(() => addCartItem(productId, quantity), 'Не удалось добавить товар.'),
    [runMutation]
  )

  const updateItem = useCallback(
    (productId: string, quantity: number) =>
      runMutation(() => updateCartItem(productId, quantity), 'Не удалось изменить количество.'),
    [runMutation]
  )

  const removeItem = useCallback(
    (productId: string) =>
      runMutation(() => removeCartItem(productId), 'Не удалось убрать товар.'),
    [runMutation]
  )

  const empty = useCallback(
    () => runMutation(() => emptyCart(), 'Не удалось очистить корзину.'),
    [runMutation]
  )

  const reload = useCallback(
    () => runMutation(() => getCart(), 'Не удалось загрузить корзину.'),
    [runMutation]
  )

  const clearError = useCallback(() => setError(null), [])

  const cart = userId === null ? null : (data ?? null)

  const value = useMemo<ICartContextValue>(
    () => ({
      cart,
      itemCount: cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      isLoading: userId !== null && isLoading,
      isBusy,
      error,
      addItem,
      updateItem,
      removeItem,
      empty,
      reload,
      clearError,
    }),
    [cart, userId, isLoading, isBusy, error, addItem, updateItem, removeItem, empty, reload, clearError]
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
