import { useSyncExternalStore } from 'react'

/**
 * Корзина и избранное гостя — в браузере, до входа.
 *
 * Раньше «в корзину» и сердце у гостя сразу уводили на `/login`: человек хотел
 * отложить баночку, а ему предлагали открыть Telegram и поделиться номером. Теперь
 * гость собирает корзину и избранное здесь, а вход нужен только на «Оформить». Сразу
 * после входа `CartContext` и `WishlistContext` переливают собранное в аккаунт
 * (`POST /cart/merge`, `POST /wishlist/merge`) и очищают хранилище.
 *
 * Хранятся только идентификаторы и количества. Названия, цены и фото каждый раз
 * приходят с сервера (`POST /cart/preview`, `/wishlist/preview`): цена, изменённая
 * после того, как гость положил товар, должна показаться новой — как и у вошедшего.
 *
 * `localStorage` может не быть вовсе (приватное окно, запрет сайта, webview) —
 * каждое обращение в `try`, и без хранилища гость просто видит пустую корзину, а не
 * падающую страницу.
 */

export interface IGuestCartLine {
  variantId: string
  /**
   * Товар этой строки — нужен, только чтобы перенести строку в избранное, когда сбор
   * закрылся (`rescueGuestCart`): избранное хранит товары, а не объёмы.
   */
  productId: string
  quantity: number
}

export interface IGuestCart {
  /**
   * Сбор, в который корзина собиралась. Сменился или закрылся — корзина уезжает в
   * избранное, как у вошедшего это делает планировщик при закрытии сбора.
   */
  cycleId: string | null
  lines: IGuestCartLine[]
}

export interface IGuestWishlistItem {
  productId: string
  /** Когда сохранено. Знает его только браузер — сервер гостя не помнит. */
  addedAt: string
}

export interface IGuestState {
  cart: IGuestCart
  /** Свежие сверху — так же, как избранное вошедшего. */
  wishlist: IGuestWishlistItem[]
}

const CART_STORAGE_KEY = 'sululu:guest-cart'
const WISHLIST_STORAGE_KEY = 'sululu:guest-wishlist'

/** Событие для своей вкладки: `storage` браузер шлёт только в соседние. */
const CHANGE_EVENT = 'sululu:guest-storage'

/** Потолки — те же, что у бэкенда (`MAX_GUEST_CART_LINES`, `MAX_WISHLIST_ITEMS`). */
export const MAX_GUEST_CART_LINES = 100
export const MAX_GUEST_WISHLIST_ITEMS = 200
export const MAX_ITEM_QUANTITY = 999

const EMPTY_CART: IGuestCart = { cycleId: null, lines: [] }

const EMPTY_STATE: IGuestState = { cart: EMPTY_CART, wishlist: [] }

const readRaw = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeRaw = (key: string, value: string | null): void => {
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch {
    // Хранилища нет или оно полно — гость останется с тем, что видит на экране.
  }

  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseJson = (raw: string | null): unknown => {
  if (raw === null) {
    return null
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/*
  Разбор — с проверкой каждого поля: значение пишет не только этот код, но и любая
  прошлая версия сайта, а битая строка не должна ронять шапку на каждой странице.
*/
const parseCart = (raw: string | null): IGuestCart => {
  const value = parseJson(raw)

  if (!isRecord(value) || !Array.isArray(value.lines)) {
    return EMPTY_CART
  }

  const lines = value.lines
    .filter(
      (line): line is IGuestCartLine =>
        isRecord(line) &&
        typeof line.variantId === 'string' &&
        typeof line.productId === 'string' &&
        typeof line.quantity === 'number' &&
        Number.isInteger(line.quantity) &&
        line.quantity >= 1
    )
    .map(line => ({
      variantId: line.variantId,
      productId: line.productId,
      quantity: Math.min(line.quantity, MAX_ITEM_QUANTITY),
    }))
    .slice(0, MAX_GUEST_CART_LINES)

  return { cycleId: typeof value.cycleId === 'string' ? value.cycleId : null, lines }
}

const parseWishlist = (raw: string | null): IGuestWishlistItem[] => {
  const value = parseJson(raw)

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(
      (item): item is IGuestWishlistItem =>
        isRecord(item) && typeof item.productId === 'string' && typeof item.addedAt === 'string'
    )
    .map(item => ({ productId: item.productId, addedAt: item.addedAt }))
    .slice(0, MAX_GUEST_WISHLIST_ITEMS)
}

/*
  Снимок кешируется по сырым строкам: `useSyncExternalStore` сравнивает снимки по
  ссылке, и новый объект на каждый вызов означал бы бесконечную перерисовку.
*/
let cachedRaw: readonly [string | null, string | null] | null = null
let cachedState: IGuestState = EMPTY_STATE

export const readGuestState = (): IGuestState => {
  if (typeof window === 'undefined') {
    return EMPTY_STATE
  }

  const cartRaw = readRaw(CART_STORAGE_KEY)
  const wishlistRaw = readRaw(WISHLIST_STORAGE_KEY)

  if (cachedRaw === null || cachedRaw[0] !== cartRaw || cachedRaw[1] !== wishlistRaw) {
    cachedRaw = [cartRaw, wishlistRaw]
    cachedState = { cart: parseCart(cartRaw), wishlist: parseWishlist(wishlistRaw) }
  }

  return cachedState
}

export const writeGuestCart = (cart: IGuestCart): void => {
  writeRaw(CART_STORAGE_KEY, cart.lines.length === 0 ? null : JSON.stringify(cart))
}

export const writeGuestWishlist = (items: IGuestWishlistItem[]): void => {
  writeRaw(WISHLIST_STORAGE_KEY, items.length === 0 ? null : JSON.stringify(items))
}

/**
 * Корзина закрывшегося сбора — в избранное.
 *
 * То же, что планировщик делает с корзинами вошедших (`cycles/scheduler_service.py`):
 * строки прошлого сбора в новый не переезжают, но и не пропадают молча — человек
 * найдёт их в избранном. Объёмы одного товара схлопываются в один товар.
 */
export const rescueGuestCart = (): void => {
  const { cart, wishlist } = readGuestState()

  if (cart.lines.length === 0) {
    return
  }

  const saved = new Set(wishlist.map(item => item.productId))
  const now = new Date().toISOString()
  const rescued: IGuestWishlistItem[] = []

  for (const line of cart.lines) {
    if (!saved.has(line.productId)) {
      saved.add(line.productId)
      rescued.push({ productId: line.productId, addedAt: now })
    }
  }

  writeGuestWishlist([...rescued, ...wishlist].slice(0, MAX_GUEST_WISHLIST_ITEMS))
  writeGuestCart(EMPTY_CART)
}

export const clearGuestCart = (): void => writeGuestCart(EMPTY_CART)

/**
 * Убрать из корзины только эти объёмы — то, что уже перенесено в аккаунт.
 *
 * Не очистка целиком: пока перенос был в пути, в хранилище могло добавиться новое —
 * из соседней вкладки, ещё не знающей о входе. Стереть всё значило бы потерять его.
 */
export const removeGuestCartLines = (variantIds: readonly string[]): void => {
  const sent = new Set(variantIds)
  const { cart } = readGuestState()

  writeGuestCart({ ...cart, lines: cart.lines.filter(line => !sent.has(line.variantId)) })
}

/**
 * Убрать из избранного только эти товары — перенесённые в аккаунт или снятые с
 * продажи. По той же причине, что и у корзины: пока запрос был в пути, сюда мог
 * лечь новый товар — например, корзина закрывшегося сбора (`rescueGuestCart`).
 */
export const removeGuestWishlistItems = (productIds: readonly string[]): void => {
  const gone = new Set(productIds)

  writeGuestWishlist(readGuestState().wishlist.filter(item => !gone.has(item.productId)))
}

const subscribe = (onChange: () => void): (() => void) => {
  /*
    `storage` — правка из соседней вкладки: гость добавил товар там, а счётчик в
    шапке этой вкладки должен догнать без перезагрузки.
  */
  const onStorage = (event: StorageEvent): void => {
    if (
      event.key === null ||
      event.key === CART_STORAGE_KEY ||
      event.key === WISHLIST_STORAGE_KEY
    ) {
      onChange()
    }
  }

  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** На сервере и на первой отрисовке гостю показывается пустое — как и до загрузки. */
const getServerSnapshot = (): IGuestState => EMPTY_STATE

/** Состояние гостя, обновляемое при любой правке — в этой вкладке и в соседних. */
export const useGuestState = (): IGuestState =>
  useSyncExternalStore(subscribe, readGuestState, getServerSnapshot)
