import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { IWishlist } from 'widgets/types'
import { messageForError, type ErrorScope } from '@/services/apiErrors'
import { wishlistKey } from '@/services/swrKeys'
import {
  addWishlistItem,
  getWishlist,
  removeWishlistItem,
} from '@/services/endpoints/wishlist'
import { useAuth } from './AuthContext'

/**
 * Избранное покупателя.
 *
 * Устроено как корзина (`CartContext`) и по тем же причинам: ручки отвечают
 * списком целиком, поэтому состояние не пересчитывается на клиенте, а
 * заменяется ответом; занятость считается по товару, а не одним флагом на весь
 * экран — иначе нажатие на одно сердце гасило бы всю сетку каталога.
 *
 * Разница с корзиной ровно одна, но принципиальная: избранное не привязано к
 * сбору. Оно и существует затем, чтобы работать, когда «в корзину» недоступна.
 */

/** Область запроса, задевающая список целиком (перезагрузка). */
const WHOLE_LIST = '*'

/** Избранного у гостя не существует — на бэкенде оно привязано к пользователю. */
const GUEST_ERROR = 'Избранное привязано к аккаунту — войдите, чтобы сохранять товары.'

export interface IWishlistResult {
  ok: boolean
  error: string | null
}

const OK: IWishlistResult = { ok: true, error: null }

export interface IWishlistContextValue {
  wishlist: IWishlist | null
  /** Сколько товаров сохранено — то, что показывает счётчик в шапке. */
  itemCount: number
  isLoading: boolean
  /** Сохранён ли этот товар: по нему сердце залито. */
  has: (productId: string) => boolean
  /** Занят ли конкретный товар: блокируется только его сердце. */
  isItemBusy: (productId: string) => boolean
  error: string | null
  add: (productId: string) => Promise<IWishlistResult>
  remove: (productId: string) => Promise<IWishlistResult>
  /** Добавить или убрать — то, что делает нажатие на сердце. */
  toggle: (productId: string) => Promise<IWishlistResult>
  reload: () => Promise<IWishlistResult>
  clearError: () => void
}

const WishlistContext = createContext<IWishlistContextValue | null>(null)

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [busy, setBusy] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error: fetchError,
    mutate: swrMutate,
  } = useSWR<IWishlist>(userId === null ? null : wishlistKey(userId), getWishlist)

  /**
   * Очередь запросов: каждая ручка отвечает списком целиком, поэтому ответ,
   * обогнавший чужой, затёр бы чужое изменение — сердце, нажатое вторым,
   * погасло бы до следующей перезагрузки.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const runMutation = useCallback(
    async (
      busyScope: string,
      action: () => Promise<IWishlist>,
      errorScope: ErrorScope,
      optimistic?: (current: IWishlist) => IWishlist
    ): Promise<IWishlistResult> => {
      if (userId === null) {
        setError(GUEST_ERROR)

        return { ok: false, error: GUEST_ERROR }
      }

      setBusy(previous => (previous.includes(busyScope) ? previous : [...previous, busyScope]))
      setError(null)

      // Чужая осечка очередь не рвёт — свой запрос уходит в любом случае.
      const sent = queue.current.then(action, action)

      queue.current = sent.then(
        () => undefined,
        () => undefined
      )

      try {
        await swrMutate(sent, {
          revalidate: false,
          optimisticData:
            optimistic === undefined || data === undefined
              ? undefined
              : (current?: IWishlist) => optimistic(current ?? data),
          rollbackOnError: true,
        })

        return OK
      } catch (cause: unknown) {
        const message = messageForError(cause, errorScope)

        setError(message)

        return { ok: false, error: message }
      } finally {
        setBusy(previous => previous.filter(item => item !== busyScope))
      }
    },
    [userId, swrMutate, data]
  )

  const add = useCallback(
    (productId: string) =>
      /*
        Без оптимистичного слепка: карточку товара знает только ответ, а
        рисовать полупустую ради 200 мс хуже, чем показать спиннер на сердце.
      */
      runMutation(productId, () => addWishlistItem(productId), 'wishlist.add'),
    [runMutation]
  )

  const remove = useCallback(
    (productId: string) =>
      /*
        А вот убрать можно сразу: карточка уже на экране, и её достаточно
        отфильтровать. Без этого товар на странице избранного оставался бы
        висеть до ответа — то есть выглядел бы неудалённым.
      */
      runMutation(productId, () => removeWishlistItem(productId), 'wishlist.remove', current => ({
        ...current,
        items: current.items.filter(item => item.product.id !== productId),
      })),
    [runMutation]
  )

  const reload = useCallback(
    () => runMutation(WHOLE_LIST, () => getWishlist(), 'wishlist.load'),
    [runMutation]
  )

  const clearError = useCallback(() => setError(null), [])

  const wishlist = userId === null ? null : (data ?? null)

  const has = useCallback(
    (productId: string): boolean =>
      wishlist?.items.some(item => item.product.id === productId) === true,
    [wishlist]
  )

  const isItemBusy = useCallback(
    (productId: string): boolean => busy.includes(productId) || busy.includes(WHOLE_LIST),
    [busy]
  )

  const toggle = useCallback(
    (productId: string) => (has(productId) ? remove(productId) : add(productId)),
    [has, add, remove]
  )

  const visibleError =
    error ?? (fetchError === undefined ? null : messageForError(fetchError, 'wishlist.load'))

  const value = useMemo<IWishlistContextValue>(
    () => ({
      wishlist,
      itemCount: wishlist?.items.length ?? 0,
      isLoading: userId !== null && isLoading,
      has,
      isItemBusy,
      error: visibleError,
      add,
      remove,
      toggle,
      reload,
      clearError,
    }),
    [
      wishlist,
      userId,
      isLoading,
      has,
      isItemBusy,
      visibleError,
      add,
      remove,
      toggle,
      reload,
      clearError,
    ]
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export const useWishlist = (): IWishlistContextValue => {
  const value = useContext(WishlistContext)

  if (value === null) {
    throw new Error('useWishlist вызван вне <WishlistProvider>')
  }

  return value
}
