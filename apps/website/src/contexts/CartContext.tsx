import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
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
 * Единственное исключение — оптимистичный слепок на время запроса (см.
 * `withQuantity`/`without` ниже): он живёт ровно до ответа и тем же ответом
 * затирается, поэтому разойтись с сервером ему негде.
 *
 * Корзина существует только у авторизованного пользователя: для гостя это
 * `null`, а не пустой объект, — экран должен предложить войти, а не делать
 * вид, что корзина есть.
 */

/** Область запроса, задевающая корзину целиком (очистка, перезагрузка). */
const WHOLE_CART = '*'

const totalOf = (items: ICart['items']): number =>
  items.reduce((sum, item) => sum + item.lineTotalCents, 0)

/**
 * Корзина с другим количеством у одной позиции.
 *
 * Арифметика повторяет бэкенд ровно: строка — `price × quantity`, итог — сумма
 * строк (`app/cart/service.py`, `_build_response`). Всё в целых копейках,
 * поэтому «почти то же самое» тут невозможно.
 */
const withQuantity = (cart: ICart, productId: string, quantity: number): ICart => {
  const items = cart.items.map(item =>
    item.productId === productId
      ? { ...item, quantity, lineTotalCents: item.productPriceCents * quantity }
      : item
  )

  return { ...cart, items, totalCents: totalOf(items) }
}

const without = (cart: ICart, productId: string): ICart => {
  const items = cart.items.filter(item => item.productId !== productId)

  return { ...cart, items, totalCents: totalOf(items) }
}

export interface ICartContextValue {
  cart: ICart | null
  /** Сумма количеств — то, что показывает счётчик в шапке. */
  itemCount: number
  /** Первая загрузка корзины ещё идёт. */
  isLoading: boolean
  /**
   * Идёт хоть какое-то изменение корзины. Блокировать по нему **весь** экран
   * нельзя: запрос по одной позиции не повод гасить кнопки у остальных — так
   * добавление одного товара мигало бы всей сеткой каталога. Годится там, где
   * важен состав целиком, — например, для перехода к оформлению.
   */
  isBusy: boolean
  /** Занята ли конкретная позиция: блокируется только она. */
  isItemBusy: (productId: string) => boolean
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

  /*
   * Занятые области: идентификаторы товаров плюс `WHOLE_CART`. Массив, а не
   * счётчик: параллельные запросы по разным позициям — обычное дело, и один
   * общий флаг гасил бы интерфейс целиком до последнего ответа.
   */
  const [busy, setBusy] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    mutate: swrMutate,
  } = useSWR<ICart>(userId === null ? null : cartKey(userId), getCart)

  /**
   * Очередь запросов к корзине.
   *
   * Каждая ручка отвечает корзиной целиком, поэтому ответ, обогнавший чужой,
   * затёр бы чужое изменение — и товар, добавленный вторым, пропал бы с
   * экрана до следующей перезагрузки. Показывать занятость по каждой позиции
   * отдельно это не мешает: ждёт очереди только сам запрос.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  /**
   * Общая обёртка изменений: пометка занятости, замена кеша ответом, разбор
   * ошибки. Возвращает, удалось ли изменение, — вызывающему не нужно ждать,
   * пока `error` доедет до него отдельным рендером.
   *
   * `optimistic` — как должна выглядеть корзина, пока ответ в пути. Без него
   * `−`/`+` в корзине не двигают число до конца запроса, и нажатие выглядит
   * потерянным.
   */
  const runMutation = useCallback(
    async (
      scope: string,
      action: () => Promise<ICart>,
      fallback: string,
      optimistic?: (current: ICart) => ICart
    ): Promise<boolean> => {
      if (userId === null) {
        return false
      }

      setBusy(previous => (previous.includes(scope) ? previous : [...previous, scope]))
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
          /*
            Слепок считается от того, что лежит в кеше на момент применения, а
            не от `data` из замыкания: пока предыдущий запрос в пути, там уже
            стоит его оптимистичный результат, и второе нажатие должно
            наращивать именно его.
          */
          optimisticData:
            optimistic === undefined || data === undefined
              ? undefined
              : (current?: ICart) => optimistic(current ?? data),
          // Ответ не пришёл — на экране должно остаться то, что есть на сервере.
          rollbackOnError: true,
        })

        return true
      } catch (cause: unknown) {
        setError(messageOf(cause, fallback))

        return false
      } finally {
        setBusy(previous => previous.filter(item => item !== scope))
      }
    },
    [userId, swrMutate, data]
  )

  const addItem = useCallback(
    (productId: string, quantity = 1) =>
      /*
        Без оптимистичного слепка: состав позиции (название, цена, картинка)
        знает только ответ, а рисовать полустроку ради 200 мс — хуже, чем
        показать спиннер на самой кнопке.
      */
      runMutation(productId, () => addCartItem(productId, quantity), 'Не удалось добавить товар.'),
    [runMutation]
  )

  const updateItem = useCallback(
    (productId: string, quantity: number) =>
      runMutation(
        productId,
        () => updateCartItem(productId, quantity),
        'Не удалось изменить количество.',
        current => withQuantity(current, productId, quantity)
      ),
    [runMutation]
  )

  const removeItem = useCallback(
    (productId: string) =>
      runMutation(
        productId,
        () => removeCartItem(productId),
        'Не удалось убрать товар.',
        current => without(current, productId)
      ),
    [runMutation]
  )

  const empty = useCallback(
    () =>
      runMutation(WHOLE_CART, () => emptyCart(), 'Не удалось очистить корзину.', current => ({
        ...current,
        items: [],
        totalCents: 0,
      })),
    [runMutation]
  )

  const reload = useCallback(
    () => runMutation(WHOLE_CART, () => getCart(), 'Не удалось загрузить корзину.'),
    [runMutation]
  )

  const clearError = useCallback(() => setError(null), [])

  const isItemBusy = useCallback(
    (productId: string): boolean => busy.includes(productId) || busy.includes(WHOLE_CART),
    [busy]
  )

  const cart = userId === null ? null : (data ?? null)

  const value = useMemo<ICartContextValue>(
    () => ({
      cart,
      itemCount: cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      isLoading: userId !== null && isLoading,
      isBusy: busy.length > 0,
      isItemBusy,
      error,
      addItem,
      updateItem,
      removeItem,
      empty,
      reload,
      clearError,
    }),
    [
      cart,
      userId,
      isLoading,
      busy,
      isItemBusy,
      error,
      addItem,
      updateItem,
      removeItem,
      empty,
      reload,
      clearError,
    ]
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
