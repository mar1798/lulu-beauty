import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import type { ICart } from 'widgets/types'
import { messageForError, type ErrorScope } from '@/services/apiErrors'
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

/**
 * Итог изменения корзины. Не просто «получилось/нет»: текст ошибки нужен там,
 * где её показывает сам вызывающий, — кнопке «в корзину» в каталоге, которая
 * живёт вне экрана корзины. Ждать, пока `error` доедет отдельным рендером,
 * ей нельзя: тост показывается сразу после `await`.
 */
export interface ICartResult {
  ok: boolean
  /** Текст под конкретное действие (`no_active_cycle` при добавлении ≠ при оформлении). */
  error: string | null
}

const OK: ICartResult = { ok: true, error: null }

/** Корзины у гостя не существует — на бэкенде она привязана к пользователю. */
const GUEST_ERROR = 'Корзина привязана к аккаунту — войдите, чтобы собрать заявку.'

export interface ICartContextValue {
  cart: ICart | null
  /** Сумма количеств — то, что показывает счётчик в шапке. */
  itemCount: number
  /** Первая загрузка корзины ещё идёт. */
  isLoading: boolean
  /**
   * Идёт запрос, меняющий корзину **целиком** (очистка, перезагрузка), —
   * только под него имеет смысл гасить общие действия вроде перехода к
   * оформлению.
   *
   * Флага «идёт хоть какой-то запрос» здесь намеренно нет: по нему кнопка
   * «Оформить» мигала бы на каждое нажатие `−`/`+` — количество меняется
   * оптимистично, состав корзины при этом не под вопросом.
   */
  isWholeCartBusy: boolean
  /** Занята ли конкретная позиция: блокируется только она. */
  isItemBusy: (productId: string) => boolean
  error: string | null
  /*
   * Изменения возвращают итог с текстом ошибки (см. `ICartResult`). Нужен он
   * прежде всего кнопке «в корзину» в карточке: она единственная живёт вне
   * экрана корзины, где ошибку никто не показывает, и должна сама объяснить,
   * почему товар не добавился, — «сбор закрыт» и «товар сняли с продажи»
   * чинятся по-разному.
   */
  addItem: (productId: string, quantity?: number) => Promise<ICartResult>
  updateItem: (productId: string, quantity: number) => Promise<ICartResult>
  removeItem: (productId: string) => Promise<ICartResult>
  empty: () => Promise<ICartResult>
  reload: () => Promise<ICartResult>
  clearError: () => void
}

const CartContext = createContext<ICartContextValue | null>(null)

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const router = useRouter()
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
    error: fetchError,
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
      busyScope: string,
      action: () => Promise<ICart>,
      errorScope: ErrorScope,
      optimistic?: (current: ICart) => ICart
    ): Promise<ICartResult> => {
      if (userId === null) {
        // Не «не получилось»: корзины у гостя нет вовсе, и сказать надо именно это.
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

        return OK
      } catch (cause: unknown) {
        const message = messageForError(cause, errorScope)

        setError(message)
        /*
          Откат возвращает снимок кеша, а тот мог отстать от сервера: ответ
          более ранней мутации SWR отбрасывает, если к его приходу успела
          начаться следующая, — и тогда снимок не знает о позиции, которую
          сервер уже принял. После осечки список перечитывается, а не
          восстанавливается по памяти.
        */
        void swrMutate()

        return { ok: false, error: message }
      } finally {
        setBusy(previous => previous.filter(item => item !== busyScope))
      }
    },
    [userId, swrMutate, data]
  )

  const addItem = useCallback(
    (productId: string, quantity = 1) =>
      /*
        Без оптимистичного слепка: состав позиции (название, цена, картинка)
        знает только ответ, а рисовать полустроку ради 200 мс не стоит. Кнопка
        в каталоге эти миллисекунды просто не отыгрывает — спиннер на ней
        читался как мигание (см. `AddToCartButton`).
      */
      runMutation(productId, () => addCartItem(productId, quantity), 'cart.add'),
    [runMutation]
  )

  const updateItem = useCallback(
    (productId: string, quantity: number) =>
      runMutation(productId, () => updateCartItem(productId, quantity), 'cart.update', current =>
        withQuantity(current, productId, quantity)
      ),
    [runMutation]
  )

  const removeItem = useCallback(
    (productId: string) =>
      runMutation(productId, () => removeCartItem(productId), 'cart.remove', current =>
        without(current, productId)
      ),
    [runMutation]
  )

  const empty = useCallback(
    () =>
      runMutation(WHOLE_CART, () => emptyCart(), 'cart.empty', current => ({
        ...current,
        items: [],
        totalCents: 0,
      })),
    [runMutation]
  )

  const reload = useCallback(
    () => runMutation(WHOLE_CART, () => getCart(), 'cart.load'),
    [runMutation]
  )

  const clearError = useCallback(() => setError(null), [])

  /*
    Ошибка последнего действия живёт в провайдере — а он смонтирован в
    `_app.tsx`, над страницей, и переживает клиентские переходы. Гасилась она
    только следующей мутацией, поэтому неудачное действие на /catalog доезжало
    до другой страницы и всплывало там как «не загрузилось» над отлично
    загруженным списком. Смена маршрута — конец жизни такой ошибки.
  */
  useEffect(() => {
    router.events.on('routeChangeComplete', clearError)

    return () => router.events.off('routeChangeComplete', clearError)
  }, [router.events, clearError])

  const isItemBusy = useCallback(
    (productId: string): boolean => busy.includes(productId) || busy.includes(WHOLE_CART),
    [busy]
  )

  const cart = userId === null ? null : (data ?? null)

  /*
   * Осечка последнего действия важнее осечки загрузки: человек только что
   * нажал кнопку и ждёт ответа именно про неё. Но и молчать о несостоявшейся
   * загрузке нельзя — иначе пустой экран выдаёт себя за пустую корзину.
   */
  const visibleError =
    error ?? (fetchError === undefined ? null : messageForError(fetchError, 'cart.load'))

  const value = useMemo<ICartContextValue>(
    () => ({
      cart,
      itemCount: cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      isLoading: userId !== null && isLoading,
      isWholeCartBusy: busy.includes(WHOLE_CART),
      isItemBusy,
      error: visibleError,
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
      visibleError,
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
