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
import type { ICart } from 'widgets/types'
import { ApiError, isApiError, messageForError, type ErrorScope } from '@/services/apiErrors'
import { cartKey, guestCartKey } from '@/services/swrKeys'
import {
  addCartItem,
  emptyCart,
  getCart,
  mergeCart,
  previewCart,
  removeCartItem,
  updateCartItem,
  type IGuestCartLineBody,
} from '@/services/endpoints/cart'
import {
  MAX_GUEST_CART_LINES,
  MAX_ITEM_QUANTITY,
  clearGuestCart,
  readGuestState,
  removeGuestCartLines,
  rescueGuestCart,
  useGuestState,
  writeGuestCart,
  type IGuestCartLine,
} from '@/utils/guestStorage'
import { useAuth } from './AuthContext'
import { useDemand } from './useDemand'

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
 * У гостя корзина своя, в браузере (`utils/guestStorage`): количества лежат
 * там, а названия, цены и фото приходят с сервера (`POST /cart/preview`) —
 * поэтому и гость видит текущие цены, а не запомненные. Вход нужен только на
 * оформлении; сразу после него гостевая корзина переливается в аккаунт
 * (`POST /cart/merge`) и очищается. `null` корзина только до того, как стало
 * известно, гость ли это.
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
const withQuantity = (cart: ICart, variantId: string, quantity: number): ICart => {
  const items = cart.items.map(item =>
    item.variantId === variantId
      ? { ...item, quantity, lineTotalCents: item.productPriceCents * quantity }
      : item
  )

  return { ...cart, items, totalCents: totalOf(items) }
}

const without = (cart: ICart, variantId: string): ICart => {
  const items = cart.items.filter(item => item.variantId !== variantId)

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

/** Сессия ещё проверяется: чья это корзина — гостя или аккаунта, — пока неизвестно. */
const UNKNOWN_OWNER_ERROR = 'Проверяем сессию - попробуйте ещё раз через секунду'

const toBody = (lines: readonly IGuestCartLine[]): IGuestCartLineBody[] =>
  lines.map(({ variantId, quantity }) => ({ variantId, quantity }))

/** Объёмы гостевой корзины одной строкой — ключ предпросмотра (`guestCartKey`). */
const variantSet = (lines: readonly IGuestCartLine[]): string =>
  lines
    .map(line => line.variantId)
    .sort()
    .join(',')

/**
 * Предпросмотр гостевой корзины. Сбор сменился или закрылся с тех пор, как она
 * собиралась, — строки уезжают в избранное, как у вошедшего при закрытии сбора.
 */
const loadGuestCart = async (): Promise<ICart> => {
  const { cart } = readGuestState()
  const preview = await previewCart(toBody(cart.lines))

  if (cart.lines.length > 0 && cart.cycleId !== null && preview.cycleId !== cart.cycleId) {
    rescueGuestCart()

    return { ...preview, items: [], totalCents: 0 }
  }

  return preview
}

/**
 * Пустая корзина гостя — без запроса: предпросматривать нечего, а пустой корзине
 * сбор не нужен (`CartPanel` рисует для неё заглушку). Иначе шапка, которая
 * подписана на корзину на каждой странице, тратила бы на каждый просмотр запрос из
 * общего лимита анонимов.
 */
const EMPTY_GUEST_CART: ICart = { cycleId: null, cycleDeadlineAt: null, items: [], totalCents: 0 }

/**
 * Перенос не состоялся из-за сбора: он закрылся или сменился, пока гость входил.
 * Строки тогда уезжают в избранное — как у вошедшего при закрытии сбора.
 */
const isStaleCycle = (cause: unknown): boolean =>
  isApiError(cause) && (cause.code === 'no_active_cycle' || cause.code === 'cart_cycle_changed')

/**
 * Гостевая корзина на экране: строки — из предпросмотра (в его порядке и только
 * живые), количества — из хранилища. Арифметика та же, что у `withQuantity`.
 */
const guestView = (preview: ICart, lines: readonly IGuestCartLine[]): ICart => {
  const quantities = new Map(lines.map(line => [line.variantId, line.quantity]))
  const items = preview.items.flatMap(item => {
    const quantity = quantities.get(item.variantId)

    return quantity === undefined
      ? []
      : [{ ...item, quantity, lineTotalCents: item.productPriceCents * quantity }]
  })

  return { ...preview, items, totalCents: totalOf(items) }
}

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
  isItemBusy: (variantId: string) => boolean
  error: string | null
  /*
   * Изменения возвращают итог с текстом ошибки (см. `ICartResult`). Нужен он
   * прежде всего кнопке «в корзину» в карточке: она единственная живёт вне
   * экрана корзины, где ошибку никто не показывает, и должна сама объяснить,
   * почему товар не добавился, — «сбор закрыт» и «товар сняли с продажи»
   * чинятся по-разному.
   */
  /* Всё адресуется объёмом: строка корзины — это объём товара, а не товар. */
  addItem: (variantId: string, quantity?: number) => Promise<ICartResult>
  updateItem: (variantId: string, quantity: number) => Promise<ICartResult>
  removeItem: (variantId: string) => Promise<ICartResult>
  empty: () => Promise<ICartResult>
  reload: () => Promise<ICartResult>
  /**
   * Ждёт, пока корзина на сервере догонит показанную на экране.
   *
   * Нужно ровно оформлению: количество меняется оптимистично, а `POST
   * /orders/checkout` идёт мимо очереди изменений — нажатие `+` и сразу
   * «Отправить заявку» иначе снимает заявку с прежнего состава, и человек
   * этого не видит. Ошибку не возвращает: осечку своей мутации вызывающий
   * уже получил её собственным `ICartResult`.
   */
  settled: () => Promise<void>
  clearError: () => void
  /**
   * Подписка потребителя на данные. Не для вызова из компонентов: её дёргает
   * сам `useCart`, и только затем, чтобы провайдер знал, нужны ли данные на этой
   * странице вообще (см. `useDemand`).
   */
  subscribe: () => () => void
}

const CartContext = createContext<ICartContextValue | null>(null)

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  /*
   * Занятые области: идентификаторы товаров плюс `WHOLE_CART`. Массив, а не
   * счётчик: параллельные запросы по разным позициям — обычное дело, и один
   * общий флаг гасил бы интерфейс целиком до последнего ответа.
   */
  const [busy, setBusy] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)
  /**
   * Итог переноса гостевой корзины — отдельно от `error`. Перенос начинается ещё на
   * `/login` и обычно кончается до перехода на оформление, а `error` гаснет на смене
   * маршрута: «товары перенесены в избранное» пропадало бы, не дойдя до экрана.
   * Гаснет он со следующим действием с корзиной или по `clearError`.
   */
  const [mergeError, setMergeError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error: fetchError,
  } = useSWR<ICart>(userId === null || !isWanted ? null : cartKey(userId), getCart)

  /*
    Гостевой предпросмотр — отдельным запросом, а не тем же `useSWR`: у него свой
    ключ и свой загрузчик, и `keepPreviousData` нужен только ему — ключ меняется с
    каждым новым товаром, и без него корзина мигала бы скелетоном на каждое
    добавление.
  */
  const guestKey =
    isGuest && isWanted && guest.cart.lines.length > 0
      ? guestCartKey(variantSet(guest.cart.lines))
      : null
  const {
    data: guestPreview,
    isLoading: isGuestLoading,
    error: guestFetchError,
  } = useSWR<ICart>(guestKey, loadGuestCart, { keepPreviousData: true })

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
   *
   * `owner` — чья корзина. Обычно это вошедший из текущего рендера, но «в корзину»,
   * нажатая до ответа `/api/auth/me`, узнаёт его сама (`addItem`) — и передаёт сюда:
   * в замыкании этого рендера `userId` ещё `null`. Поэтому и кеш меняется по ключу
   * владельца, а не через `mutate` хука, привязанный к ключу рендера.
   */
  const runMutation = useCallback(
    async (
      busyScope: string,
      action: () => Promise<ICart>,
      errorScope: ErrorScope,
      optimistic?: (current: ICart) => ICart,
      owner: string | null = userId
    ): Promise<ICartResult> => {
      if (owner === null) {
        // Гостевые правки сюда не приходят (`runGuest`) — значит, сессия ещё не проверена.
        setError(UNKNOWN_OWNER_ERROR)

        return { ok: false, error: UNKNOWN_OWNER_ERROR }
      }

      setBusy(previous => (previous.includes(busyScope) ? previous : [...previous, busyScope]))
      setError(null)
      setMergeError(null)

      // Чужая осечка очередь не рвёт — свой запрос уходит в любом случае.
      const sent = queue.current.then(action, action)

      queue.current = sent.then(
        () => undefined,
        () => undefined
      )

      try {
        await globalMutate(cartKey(owner), sent, {
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
        void globalMutate(cartKey(owner))

        return { ok: false, error: message }
      } finally {
        setBusy(previous => previous.filter(item => item !== busyScope))
      }
    },
    [userId, globalMutate, data]
  )

  /**
   * Правка гостевой корзины. Синхронная почти всегда — хранилище в браузере, — и
   * ошибки её те же, что отдал бы бэкенд, с теми же текстами (`ApiError` с кодом).
   */
  const runGuest = useCallback(
    async (
      busyScope: string,
      action: () => Promise<void> | void,
      errorScope: ErrorScope
    ): Promise<ICartResult> => {
      setBusy(previous => (previous.includes(busyScope) ? previous : [...previous, busyScope]))
      setError(null)
      setMergeError(null)

      try {
        await action()

        return OK
      } catch (cause: unknown) {
        const message = messageForError(cause, errorScope)

        setError(message)

        return { ok: false, error: message }
      } finally {
        setBusy(previous => previous.filter(item => item !== busyScope))
      }
    },
    []
  )

  /** Сбор открыт — по последнему предпросмотру. Без него менять корзину нельзя. */
  const requireGuestCycle = useCallback((): void => {
    if (guestPreview !== undefined && guestPreview.cycleId === null) {
      throw new ApiError(409, 'no_active_cycle')
    }
  }, [guestPreview])

  const addGuestItem = useCallback(
    async (variantId: string, quantity: number): Promise<void> => {
      const { cart: current } = readGuestState()
      const existing = current.lines.find(line => line.variantId === variantId)

      if (existing !== undefined) {
        requireGuestCycle()
        writeGuestCart({
          ...current,
          lines: current.lines.map(line =>
            line === existing
              ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_ITEM_QUANTITY) }
              : line
          ),
        })

        return
      }

      /*
        Новый объём сверяется с сервером до того, как лечь в корзину: открыт ли сбор и
        продаётся ли он ещё, — те же проверки, что у `POST /cart/items`. Иначе гость
        узнал бы о закрытом сборе только на оформлении, после входа.
      */
      const preview = await previewCart([{ variantId, quantity }])
      const item = preview.items.find(line => line.variantId === variantId)

      if (preview.cycleId === null) {
        throw new ApiError(409, 'no_active_cycle')
      }

      if (item === undefined) {
        throw new ApiError(404, 'product_not_found')
      }

      // Корзина прошлого сбора в новый не переезжает — сначала в избранное.
      if (current.cycleId !== null && current.cycleId !== preview.cycleId) {
        rescueGuestCart()
      }

      /*
        Хранилище перечитывается после ответа: пока предпросмотр был в пути, тот же
        объём могло положить второе нажатие или соседняя вкладка — тогда строка
        одна, и растёт её количество, а не появляется вторая.
      */
      const { cart: base } = readGuestState()
      const twin = base.lines.find(line => line.variantId === variantId)

      if (twin === undefined && base.lines.length >= MAX_GUEST_CART_LINES) {
        throw new ApiError(422, 'guest_cart_full')
      }

      const lines =
        twin === undefined
          ? [...base.lines, { variantId, productId: item.productId, quantity }]
          : base.lines.map(line =>
              line === twin
                ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_ITEM_QUANTITY) }
                : line
            )

      writeGuestCart({ cycleId: preview.cycleId, lines })

      /*
        Строка нового объёма уже пришла в ответе — кладём её в кеш под новым ключом
        сразу, иначе она и счётчик в шапке появлялись бы только после следующего
        предпросмотра. Перечитывается он всё равно: порядок строк и цены остальных
        задаёт сервер.
      */
      const known = (guestPreview?.items ?? []).filter(line => line.variantId !== variantId)

      void globalMutate(
        guestCartKey(variantSet(lines)),
        { ...preview, items: [...known, item] },
        { revalidate: true }
      )
    },
    [requireGuestCycle, guestPreview, globalMutate]
  )

  const updateGuestItem = useCallback(
    (variantId: string, quantity: number): void => {
      requireGuestCycle()

      const { cart: current } = readGuestState()

      if (!current.lines.some(line => line.variantId === variantId)) {
        throw new ApiError(404, 'cart_item_not_found')
      }

      writeGuestCart({
        ...current,
        lines: current.lines.map(line =>
          line.variantId === variantId ? { ...line, quantity } : line
        ),
      })
    },
    [requireGuestCycle]
  )

  const removeGuestItem = useCallback((variantId: string): void => {
    const { cart: current } = readGuestState()

    if (!current.lines.some(line => line.variantId === variantId)) {
      throw new ApiError(404, 'cart_item_not_found')
    }

    writeGuestCart({
      ...current,
      lines: current.lines.filter(line => line.variantId !== variantId),
    })
  }, [])

  const addItem = useCallback(
    async (variantId: string, quantity = 1): Promise<ICartResult> =>
      /*
        Пока `/api/auth/me` не ответил, неизвестно, чья корзина. Ждём ответа прямо
        здесь, а не гасим кнопки на это время: сетка каталога мигала бы
        приглушёнными «+» сразу после загрузки страницы.
      */
      {
        const owner = isAuthLoading ? ((await reloadSession())?.id ?? null) : userId

        return owner === null
          ? runGuest(variantId, () => addGuestItem(variantId, quantity), 'cart.add')
          : /*
              Без оптимистичного слепка: состав позиции (название, цена, картинка)
              знает только ответ, а рисовать полустроку ради 200 мс не стоит. Кнопка
              в каталоге эти миллисекунды просто не отыгрывает — спиннер на ней
              читался как мигание (см. `AddToCartButton`).
            */
            runMutation(
              variantId,
              () => addCartItem(variantId, quantity),
              'cart.add',
              undefined,
              owner
            )
      },
    [isAuthLoading, reloadSession, userId, runGuest, addGuestItem, runMutation]
  )

  const updateItem = useCallback(
    (variantId: string, quantity: number) =>
      isGuest
        ? runGuest(variantId, () => updateGuestItem(variantId, quantity), 'cart.update')
        : runMutation(
            variantId,
            () => updateCartItem(variantId, quantity),
            'cart.update',
            current => withQuantity(current, variantId, quantity)
          ),
    [isGuest, runGuest, updateGuestItem, runMutation]
  )

  const removeItem = useCallback(
    (variantId: string) =>
      isGuest
        ? runGuest(variantId, () => removeGuestItem(variantId), 'cart.remove')
        : runMutation(
            variantId,
            () => removeCartItem(variantId),
            'cart.remove',
            current => without(current, variantId)
          ),
    [isGuest, runGuest, removeGuestItem, runMutation]
  )

  const empty = useCallback(
    () =>
      isGuest
        ? runGuest(WHOLE_CART, clearGuestCart, 'cart.empty')
        : runMutation(
            WHOLE_CART,
            () => emptyCart(),
            'cart.empty',
            current => ({
              ...current,
              items: [],
              totalCents: 0,
            })
          ),
    [isGuest, runGuest, runMutation]
  )

  const reload = useCallback(
    () =>
      isGuest
        ? runGuest(
            WHOLE_CART,
            async () => {
              await globalMutate(guestCartKey(variantSet(readGuestState().cart.lines)))
            },
            'cart.load'
          )
        : runMutation(WHOLE_CART, () => getCart(), 'cart.load'),
    [isGuest, runGuest, globalMutate, runMutation]
  )

  /*
    Перенос гостевой корзины в аккаунт — сразу, как только стало известно, кто вошёл,
    и независимо от того, показывает ли корзину текущая страница: человек входил ради
    оформления, и корзина должна ждать его там уже своей.

    С корзиной уходит и сбор, в который она собиралась: закрылся или сменился — бэкенд
    откажет (`cart_cycle_changed`), и строки уедут в избранное. Проверить это здесь,
    по предпросмотру, нельзя: вход, случившийся до первого предпросмотра (Mini App
    входит сразу), его так и не увидел бы.

    Через ту же очередь, что и правки: оформление ждёт её (`settled`), поэтому заявка
    не уйдёт раньше, чем корзина перенесётся. Повтор (вторая вкладка, перезагрузка
    посреди ответа) безвреден — бэкенд берёт большее из количеств, а не сумму.
  */
  const mergingFor = useRef<string | null>(null)
  /**
   * Чей перенос не удался. Пока он не удался, корзина считается загружающейся
   * (`isMergePending`): иначе оформление успевало сказать «оформлять нечего» над
   * корзиной, которая вот-вот приедет.
   */
  const [mergeFailedFor, setMergeFailedFor] = useState<string | null>(null)

  useEffect(() => {
    const { cycleId, lines } = guest.cart

    if (userId === null || lines.length === 0 || mergingFor.current === userId) {
      return
    }

    mergingFor.current = userId

    const sent = queue.current.then(() => mergeCart(toBody(lines), cycleId))

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
        setMergeFailedFor(null)
        // Только отправленное: пока ответ шёл, сюда могло лечь новое (`removeGuestCartLines`).
        removeGuestCartLines(lines.map(line => line.variantId))
        void globalMutate(cartKey(userId), merged, { revalidate: false })
      })
      .catch((cause: unknown) => {
        mergingFor.current = null
        if (isStaleCycle(cause)) {
          // Строки — в избранное, оно перенесётся следом. Сказать об этом обязательно:
          // человек входил оформлять и иначе увидел бы пустую корзину без объяснений.
          rescueGuestCart()
        } else {
          // Хранилище не трогаем: перенос повторится при следующем открытии сайта.
          setMergeFailedFor(userId)
        }

        setMergeError(messageForError(cause, 'cart.merge'))
      })
  }, [userId, guest.cart, globalMutate])

  /*
    Очередь не рвётся на осечках (`runMutation` гасит их при постановке), так
    что ждать её можно без `try`.
  */
  const settled = useCallback(async (): Promise<void> => {
    await queue.current
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setMergeError(null)
  }, [])

  const clearActionError = useCallback(() => setError(null), [])

  /*
    Ошибка последнего действия живёт в провайдере — а он смонтирован в
    `_app.tsx`, над страницей, и переживает клиентские переходы. Гасилась она
    только следующей мутацией, поэтому неудачное действие на /catalog доезжало
    до другой страницы и всплывало там как «не загрузилось» над отлично
    загруженным списком. Смена маршрута — конец жизни такой ошибки.
  */
  useEffect(() => {
    router.events.on('routeChangeComplete', clearActionError)

    return () => router.events.off('routeChangeComplete', clearActionError)
  }, [router.events, clearActionError])

  const isItemBusy = useCallback(
    (variantId: string): boolean => busy.includes(variantId) || busy.includes(WHOLE_CART),
    [busy]
  )

  const isMergePending = userId !== null && guest.cart.lines.length > 0 && mergeFailedFor !== userId

  const cart = useMemo<ICart | null>(
    () =>
      userId !== null
        ? (data ?? null)
        : !isGuest
          ? null
          : guest.cart.lines.length === 0
            ? EMPTY_GUEST_CART
            : guestPreview === undefined
              ? null
              : guestView(guestPreview, guest.cart.lines),
    [userId, data, isGuest, guestPreview, guest.cart.lines]
  )

  const loadError = userId !== null ? fetchError : isGuest ? guestFetchError : undefined

  /*
   * Осечка последнего действия важнее осечки загрузки: человек только что
   * нажал кнопку и ждёт ответа именно про неё. Но и молчать о несостоявшейся
   * загрузке нельзя — иначе пустой экран выдаёт себя за пустую корзину.
   */
  const visibleError =
    error ??
    mergeError ??
    (loadError === undefined ? null : messageForError(loadError, 'cart.load'))

  const value = useMemo<ICartContextValue>(
    () => ({
      cart,
      itemCount: cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      // Пока гостевая корзина переносится, показывать корзину аккаунта рано: в ней
      // ещё нет того, ради чего человек входил.
      isLoading: userId !== null ? isLoading || isMergePending : isGuest && isGuestLoading,
      isWholeCartBusy: busy.includes(WHOLE_CART),
      isItemBusy,
      error: visibleError,
      addItem,
      updateItem,
      removeItem,
      empty,
      reload,
      settled,
      clearError,
      subscribe,
    }),
    [
      cart,
      userId,
      isLoading,
      isMergePending,
      isGuest,
      isGuestLoading,
      busy,
      isItemBusy,
      visibleError,
      addItem,
      updateItem,
      removeItem,
      empty,
      reload,
      settled,
      clearError,
      subscribe,
    ]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

/**
 * `isSubscribed` — нужны ли вызывающему сами данные, а не только действия.
 * По умолчанию да: обычный потребитель на то и вызывает хук, чтобы показать
 * корзину. `false` говорит провайдеру не ходить за ней вовсе — так делает
 * каркас админки, где шапка витрины есть, а счётчика в ней нет.
 */
export const useCart = (isSubscribed = true): ICartContextValue => {
  const value = useContext(CartContext)

  if (value === null) {
    throw new Error('useCart вызван вне <CartProvider>')
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
