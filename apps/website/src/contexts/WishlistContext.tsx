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
import useSWR, { useSWRConfig } from 'swr'
import type { IProduct, IWishlist } from 'widgets/types'
import { ApiError, messageForError, type ErrorScope } from '@/services/apiErrors'
import { guestWishlistKey, wishlistKey } from '@/services/swrKeys'
import {
  addWishlistItem,
  getWishlist,
  mergeWishlist,
  previewWishlist,
  removeWishlistItem,
  type IGuestWishlistPreview,
} from '@/services/endpoints/wishlist'
import {
  MAX_GUEST_WISHLIST_ITEMS,
  readGuestState,
  removeGuestWishlistItems,
  useGuestState,
  writeGuestWishlist,
  type IGuestWishlistItem,
} from '@/utils/guestStorage'
import { useAuth } from './AuthContext'
import { useDemand } from './useDemand'

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
 *
 * У гостя список свой, в браузере (`utils/guestStorage`), а карточки к нему
 * приходят с сервера (`POST /wishlist/preview`). После входа он переливается в
 * аккаунт (`POST /wishlist/merge`), и перенесённое из хранилища убирается.
 */

/** Область запроса, задевающая список целиком (перезагрузка). */
const WHOLE_LIST = '*'

/** Сессия ещё проверяется: чей это список — гостя или аккаунта, — пока неизвестно. */
const UNKNOWN_OWNER_ERROR = 'Проверяем сессию - попробуйте ещё раз через секунду'

const idsOf = (items: readonly IGuestWishlistItem[]): string[] => items.map(item => item.productId)

/**
 * Товары гостевого списка — ключ предпросмотра хранит их через запятую.
 *
 * Снятые с продажи предпросмотр не возвращает, и из хранилища они уходят: иначе
 * счётчик в шапке считал бы товары, которых в списке не видно, а сами они занимали
 * бы места под потолком в 200.
 */
const loadGuestWishlist = async ([, , joined]: readonly [
  string,
  string,
  string,
]): Promise<IGuestWishlistPreview> => {
  const ids = joined === '' ? [] : joined.split(',')
  const preview = await previewWishlist(ids)
  const live = new Set(preview.products.map(product => product.id))
  const gone = ids.filter(id => !live.has(id))

  if (gone.length > 0) {
    removeGuestWishlistItems(gone)
  }

  return preview
}

/**
 * Список гостя на экране: порядок и даты — из хранилища, карточки — из
 * предпросмотра. Снятых с продажи предпросмотр не вернёт, и они выпадают, как у
 * вошедшего.
 */
const guestView = (
  preview: IGuestWishlistPreview,
  items: readonly IGuestWishlistItem[]
): IWishlist => {
  const products = new Map<string, IProduct>(preview.products.map(product => [product.id, product]))

  return {
    items: items.flatMap(item => {
      const product = products.get(item.productId)

      return product === undefined ? [] : [{ product, addedAt: item.addedAt }]
    }),
  }
}

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
  /**
   * Подписка потребителя на данные. Не для вызова из компонентов: её дёргает
   * сам `useWishlist`, и только затем, чтобы провайдер знал, нужны ли данные на этой
   * странице вообще (см. `useDemand`).
   */
  subscribe: () => () => void
}

const WishlistContext = createContext<IWishlistContextValue | null>(null)

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: isAuthLoading, reload: reloadSession } = useAuth()
  const router = useRouter()
  const userId = user?.id ?? null
  const isGuest = user === null && !isAuthLoading
  const guest = useGuestState()
  const { mutate: globalMutate } = useSWRConfig()

  /*
    Запрос уходит только тогда, когда данные кому-то нужны: провайдер живёт в
    `_app.tsx`, то есть на всех страницах, а показывают их далеко не все
    (см. `useDemand`).
  */
  const { isWanted, subscribe } = useDemand()

  const [busy, setBusy] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error: fetchError,
  } = useSWR<IWishlist>(userId === null || !isWanted ? null : wishlistKey(userId), getWishlist)

  /*
    Сердцам в каталоге предпросмотр не нужен — им хватает хранилища (`has`). Он
    нужен списку товаров, поэтому ключ — набор id, а `keepPreviousData` не даёт
    странице избранного мигать на каждом нажатии.
  */
  const guestKey =
    isGuest && isWanted && guest.wishlist.length > 0
      ? guestWishlistKey(idsOf(guest.wishlist).join(','))
      : null
  const {
    data: guestPreview,
    isLoading: isGuestLoading,
    error: guestFetchError,
  } = useSWR<IGuestWishlistPreview, unknown, typeof guestKey>(guestKey, loadGuestWishlist, {
    keepPreviousData: true,
  })

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
      optimistic?: (current: IWishlist) => IWishlist,
      // Чей список: см. `owner` у `runMutation` в `CartContext` — здесь то же самое.
      owner: string | null = userId
    ): Promise<IWishlistResult> => {
      if (owner === null) {
        // Гостевые правки сюда не приходят (`runGuest`) — значит, сессия ещё не проверена.
        setError(UNKNOWN_OWNER_ERROR)

        return { ok: false, error: UNKNOWN_OWNER_ERROR }
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
        await globalMutate(wishlistKey(owner), sent, {
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
        /*
          Откат возвращает снимок кеша, а тот мог отстать от сервера: ответ
          более ранней мутации SWR отбрасывает, если к его приходу успела
          начаться следующая, — и тогда снимок не знает о позиции, которую
          сервер уже принял. После осечки список перечитывается, а не
          восстанавливается по памяти.
        */
        void globalMutate(wishlistKey(owner))

        return { ok: false, error: message }
      } finally {
        setBusy(previous => previous.filter(item => item !== busyScope))
      }
    },
    [userId, globalMutate, data]
  )

  /** Правка гостевого списка: синхронная, ошибки — с теми же кодами, что у бэкенда. */
  const runGuest = useCallback(
    (action: () => void, errorScope: ErrorScope): Promise<IWishlistResult> => {
      setError(null)

      try {
        action()

        return Promise.resolve(OK)
      } catch (cause: unknown) {
        const message = messageForError(cause, errorScope)

        setError(message)

        return Promise.resolve({ ok: false, error: message })
      }
    },
    []
  )

  const addGuest = useCallback((productId: string): void => {
    const { wishlist: current } = readGuestState()

    // Повторное сохранение — не ошибка, как и у бэкенда.
    if (current.some(item => item.productId === productId)) {
      return
    }

    if (current.length >= MAX_GUEST_WISHLIST_ITEMS) {
      throw new ApiError(409, 'wishlist_full')
    }

    writeGuestWishlist([{ productId, addedAt: new Date().toISOString() }, ...current])
  }, [])

  const removeGuest = useCallback((productId: string): void => {
    const { wishlist: current } = readGuestState()

    if (!current.some(item => item.productId === productId)) {
      throw new ApiError(404, 'wishlist_item_not_found')
    }

    writeGuestWishlist(current.filter(item => item.productId !== productId))
  }, [])

  const add = useCallback(
    async (productId: string): Promise<IWishlistResult> => {
      // Сессия ещё проверяется — ждём ответа здесь, как и «в корзину» (`CartContext`).
      const owner = isAuthLoading ? ((await reloadSession())?.id ?? null) : userId

      return owner === null
        ? runGuest(() => addGuest(productId), 'wishlist.add')
        : /*
              Без оптимистичного слепка: карточку товара знает только ответ, а
              рисовать полупустую ради 200 мс хуже, чем показать спиннер на сердце.
            */
          runMutation(productId, () => addWishlistItem(productId), 'wishlist.add', undefined, owner)
    },
    [isAuthLoading, reloadSession, userId, runGuest, addGuest, runMutation]
  )

  const remove = useCallback(
    (productId: string) =>
      /*
        А вот убрать можно сразу: карточка уже на экране, и её достаточно
        отфильтровать. Без этого товар на странице избранного оставался бы
        висеть до ответа — то есть выглядел бы неудалённым.
      */
      isGuest
        ? runGuest(() => removeGuest(productId), 'wishlist.remove')
        : runMutation(
            productId,
            () => removeWishlistItem(productId),
            'wishlist.remove',
            current => ({
              ...current,
              items: current.items.filter(item => item.product.id !== productId),
            })
          ),
    [isGuest, runGuest, removeGuest, runMutation]
  )

  const reload = useCallback(async (): Promise<IWishlistResult> => {
    if (!isGuest) {
      return runMutation(WHOLE_LIST, () => getWishlist(), 'wishlist.load')
    }

    const ids = idsOf(readGuestState().wishlist)

    if (ids.length > 0) {
      await globalMutate(guestWishlistKey(ids.join(',')))
    }

    return OK
  }, [isGuest, runMutation, globalMutate])

  /*
    Перенос гостевого избранного в аккаунт — как и у корзины, сразу после входа и на
    любой странице. Повтор безвреден: уже сохранённое бэкенд не трогает. Сюда же
    попадает и гостевая корзина закрывшегося сбора (`rescueGuestCart`), поэтому
    эффект следит за самим хранилищем, а не только за входом.
  */
  const mergingFor = useRef<string | null>(null)

  useEffect(() => {
    const ids = idsOf(guest.wishlist)

    if (userId === null || ids.length === 0 || mergingFor.current === userId) {
      return
    }

    mergingFor.current = userId

    const sent = queue.current.then(() => mergeWishlist(ids))

    queue.current = sent.then(
      () => undefined,
      () => undefined
    )

    /*
      Флаг снимается до записи в хранилище, а не в `finally`: запись перерисовывает
      провайдер, и эффект должен увидеть, что перенос кончился, — иначе то, что
      легло в хранилище за время переноса, ждало бы следующего открытия сайта.
    */
    sent
      .then(merged => {
        mergingFor.current = null
        // Только отправленное: пока ответ шёл, сюда могла лечь корзина закрывшегося
        // сбора (`rescueGuestCart`) — она перенесётся следующим заходом эффекта.
        removeGuestWishlistItems(ids)
        void globalMutate(wishlistKey(userId), merged, { revalidate: false })
      })
      .catch((cause: unknown) => {
        mergingFor.current = null
        // Хранилище не трогаем: перенос повторится при следующем открытии сайта.
        setError(messageForError(cause, 'wishlist.merge'))
      })
  }, [userId, guest.wishlist, globalMutate])

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

  const wishlist = useMemo<IWishlist | null>(
    () =>
      userId !== null
        ? (data ?? null)
        : !isGuest
          ? null
          : guest.wishlist.length === 0
            ? { items: [] }
            : guestPreview === undefined
              ? null
              : guestView(guestPreview, guest.wishlist),
    [userId, data, isGuest, guest.wishlist, guestPreview]
  )

  const has = useCallback(
    (productId: string): boolean =>
      isGuest
        ? guest.wishlist.some(item => item.productId === productId)
        : wishlist?.items.some(item => item.product.id === productId) === true,
    [isGuest, guest.wishlist, wishlist]
  )

  const isItemBusy = useCallback(
    (productId: string): boolean => busy.includes(productId) || busy.includes(WHOLE_LIST),
    [busy]
  )

  const toggle = useCallback(
    (productId: string) => (has(productId) ? remove(productId) : add(productId)),
    [has, add, remove]
  )

  const loadError = userId !== null ? fetchError : isGuest ? guestFetchError : undefined

  const visibleError =
    error ?? (loadError === undefined ? null : messageForError(loadError, 'wishlist.load'))

  const value = useMemo<IWishlistContextValue>(
    () => ({
      wishlist,
      /*
        У гостя — по показанному списку, а пока его нет, по хранилищу: счётчику в
        шапке незачем ждать карточек. Снятые с продажи из хранилища убирает
        предпросмотр (`loadGuestWishlist`), так что разойтись надолго им негде.
      */
      itemCount: isGuest
        ? (wishlist?.items.length ?? guest.wishlist.length)
        : (wishlist?.items.length ?? 0),
      isLoading: userId !== null ? isLoading : isGuest && isGuestLoading,
      has,
      isItemBusy,
      error: visibleError,
      add,
      remove,
      toggle,
      reload,
      clearError,
      subscribe,
    }),
    [
      wishlist,
      userId,
      isLoading,
      isGuest,
      isGuestLoading,
      guest.wishlist.length,
      has,
      isItemBusy,
      visibleError,
      add,
      remove,
      toggle,
      reload,
      clearError,
      subscribe,
    ]
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

/**
 * `isSubscribed` — нужны ли вызывающему сами данные, а не только действия.
 * По умолчанию да: обычный потребитель на то и вызывает хук, чтобы показать
 * избранное. `false` говорит провайдеру не ходить за ним вовсе — так делает
 * каркас админки, где шапка витрины есть, а счётчика в ней нет.
 */
export const useWishlist = (isSubscribed = true): IWishlistContextValue => {
  const value = useContext(WishlistContext)

  if (value === null) {
    throw new Error('useWishlist вызван вне <WishlistProvider>')
  }

  /*
    Сам факт вызова и есть подписка: провайдер не ходит за данными, пока их
    никто не показывает (см. `useDemand`). `subscribe` возвращает отписку,
    поэтому эффекту достаточно её вернуть.

    Условный хук после `throw` — не нарушение правил: отсутствие провайдера
    роняет рендер целиком, и до второго вызова с тем же деревом дело не дойдёт.
  */
  const { subscribe } = value

  useEffect(() => (isSubscribed ? subscribe() : undefined), [isSubscribed, subscribe])

  return value
}
