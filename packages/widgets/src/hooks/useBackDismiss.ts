import { useCallback, useEffect, useRef } from 'react'

/**
 * Закрытие оверлея жестом «назад» — для меню, панели поиска и модалки.
 *
 * На телефоне «назад» — самый естественный способ закрыть то, что выехало поверх
 * страницы, а без записи в истории он уводил со страницы целиком. Поэтому на открытии
 * в историю кладётся ещё одна запись, а «назад» с неё только закрывает оверлей.
 *
 * Запись — копия текущего `history.state` с меткой. Копия, а не пустой объект, потому
 * что оверлей может закрыться и переходом по ссылке (пункт меню, строка поиска): тогда
 * запись остаётся под новой страницей, и «назад» с неё должен привести роутер туда же,
 * откуда оверлей открывали, — роутер Next игнорирует записи без своих полей и оставил
 * бы новую страницу под старым адресом. Такую осиротевшую запись общий слушатель ниже
 * пролистывает, чтобы «назад» не тратился на пустой шаг.
 *
 * Слушатель `popstate` ставится на фазу захвата: на самом `window` такие слушатели
 * срабатывают раньше обычных, и `stopImmediatePropagation` не пускает событие к
 * роутеру — тот иначе перерисовал бы страницу, на которой человек и так стоит.
 *
 * Возвращает `requestClose` — закрыть «изнутри» (крестик, Escape, фон): он уходит со
 * своей записи через `history.back()`, и закрытие идёт тем же путём, что и жест.
 * Закрылся оверлей иначе (кнопка в диалоге, родитель сменил `isOpen`) — запись
 * снимается на размонтировании, тоже через `history.back()`, но молча для роутера.
 * Кроме случая, когда закрытие вызвал клик по ссылке: тогда роутер вот-вот положит
 * поверх новую страницу, и `back()` столкнулся бы с его переходом, — запись остаётся
 * осиротевшей, и её пролистает общий слушатель.
 *
 * Закрыть оверлей может и код, который тут же уводит на другую страницу
 * (`router.push` после подтверждения в диалоге), — клика по ссылке тогда нет, и
 * `back()` уже в пути, когда роутер кладёт новую запись. `back()` асинхронный, и
 * `pushState`, сделанный до его исполнения, он бы тут же и снял. Поэтому, пока наш
 * `back()` не дошёл, `pushState`/`replaceState` страницы ждут его в очереди — см.
 * `installSkipper`.
 */

const MARK = '__overlay'

let counter = 0

/** Какие оверлеи сейчас держат запись — чтобы отличить живую от осиротевшей. */
const openTokens = new Set<string>()

let isSkipperInstalled = false

/**
 * Наши собственные `history.back()`/`forward()`, ещё не дошедшие до `popstate`, и
 * сколько из них роутеру видеть не нужно (снятие записи на размонтировании).
 *
 * Пока хоть один в пути, новые записи ждут — и оверлеев (`waitingPushes`), и самой
 * страницы (`deferredCalls`, см. `installSkipper`): переход асинхронный, и
 * `pushState`, сделанный до его исполнения, он бы тут же и снял.
 */
let pendingPops = 0
let pendingSilentPops = 0
const waitingPushes = new Set<() => void>()
const deferredCalls: Array<() => void> = []

/**
 * Страховка: если `popstate` так и не пришёл (браузер отказал в переходе), очередь
 * не должна висеть вечно — через это время она выполняется как есть.
 */
const PENDING_POP_TIMEOUT_MS = 500

let pendingTimer: ReturnType<typeof setTimeout> | null = null

/** После текущей рассылки `popstate` — чтобы слушатели оверлеев успели её увидеть. */
const flushWaitingPushes = (): void => {
  setTimeout(() => {
    if (pendingPops > 0) {
      return
    }

    if (pendingTimer !== null) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }

    // Сначала записи страницы: они были сделаны раньше, чем открылся новый оверлей.
    deferredCalls.splice(0).forEach(call => call())

    const pushes = [...waitingPushes]

    waitingPushes.clear()
    pushes.forEach(push => push())
  }, 0)
}

const traverse = (step: -1 | 1, isSilent: boolean): void => {
  pendingPops += 1

  if (isSilent) {
    pendingSilentPops += 1
  }

  if (pendingTimer === null) {
    pendingTimer = setTimeout(() => {
      pendingTimer = null
      pendingPops = 0
      pendingSilentPops = 0
      flushWaitingPushes()
    }, PENDING_POP_TIMEOUT_MS)
  }

  window.history.go(step)
}

const goBack = (isSilent: boolean): void => traverse(-1, isSilent)

/** Когда последний раз кликнули по ссылке — см. закрытие на размонтировании. */
let lastLinkClickAt = -Infinity

/** Окно, в котором закрытие считается следствием клика по ссылке. */
const LINK_CLICK_GRACE_MS = 1000

/**
 * Оверлей закрывается ради перехода, который начнёт не клик по ссылке, а код
 * (`router.push` по Enter в поиске). Запись тогда остаётся — как после клика.
 */
export const noteOverlayNavigation = (): void => {
  lastLinkClickAt = performance.now()
}

/**
 * Ключ записи, который кладёт роутер Next (`history.state.key`), или `null` без него.
 * Осиротевшая запись — копия той, над которой открывался оверлей, и ключ у них общий.
 */
const readKey = (state: unknown): string | null => {
  if (typeof state === 'object' && state !== null && 'key' in state) {
    const { key } = state as { key: unknown }

    return typeof key === 'string' ? key : null
  }

  return null
}

/** Ключ записи, на которой страница стояла до последнего перехода. */
let lastKey: string | null = null

const readMark = (state: unknown): string | null => {
  if (typeof state === 'object' && state !== null && MARK in state) {
    const mark = (state as Record<string, unknown>)[MARK]

    return typeof mark === 'string' ? mark : null
  }

  return null
}

/**
 * Пролистывает осиротевшие записи в ту сторону, куда шёл человек, глушит собственные
 * снятия записей, придерживает записи страницы, пока наш переход в пути, и запоминает
 * клики по ссылкам. Ставится один раз и живёт, пока жива страница.
 */
const installSkipper = (): void => {
  if (isSkipperInstalled) {
    return
  }

  isSkipperInstalled = true
  lastKey = readKey(window.history.state)

  /*
    Роутер Next берёт `window.history[method]` в момент вызова, так что подмена
    доходит и до него. Вызов, сделанный, пока наш `back()` в пути, выполняется
    сразу после его `popstate` — в том же порядке.
  */
  const defer = (method: 'pushState' | 'replaceState'): void => {
    const original = window.history[method].bind(window.history)

    window.history[method] = (data: unknown, unused: string, url?: string | URL | null): void => {
      if (pendingPops > 0) {
        deferredCalls.push(() => window.history[method](data, unused, url))

        return
      }

      lastKey = readKey(data)
      original(data, unused, url)
    }
  }

  defer('pushState')
  defer('replaceState')

  document.addEventListener(
    'click',
    event => {
      if (event.target instanceof Element && event.target.closest('a[href]') !== null) {
        lastLinkClickAt = performance.now()
      }
    },
    { capture: true }
  )

  window.addEventListener(
    'popstate',
    event => {
      const cameFrom = lastKey

      lastKey = readKey(event.state)

      if (pendingPops > 0) {
        pendingPops -= 1
        flushWaitingPushes()
      }

      if (pendingSilentPops > 0) {
        pendingSilentPops -= 1
        event.stopImmediatePropagation()

        return
      }

      const mark = readMark(event.state)

      if (mark === null || openTokens.has(mark)) {
        return
      }

      /*
        Осиротевшая запись — копия той, над которой открывался оверлей. Пришли с неё
        самой (тот же ключ) — человек шёл вперёд, и его надо пропустить дальше;
        откуда угодно ещё — назад. Без ключей (не Next) направление не узнать, и
        «назад» — то, что случается в сотни раз чаще.
      */
      event.stopImmediatePropagation()
      traverse(cameFrom !== null && cameFrom === lastKey ? 1 : -1, false)
    },
    { capture: true }
  )
}

export const useBackDismiss = (isOpen: boolean, onClose: () => void): (() => void) => {
  const tokenRef = useRef<string | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return
    }

    installSkipper()

    counter += 1
    const token = `overlay-${counter}`
    let isPushed = false

    const push = (): void => {
      const baseState: unknown = window.history.state

      isPushed = true
      tokenRef.current = token
      openTokens.add(token)
      window.history.pushState(
        {
          ...(typeof baseState === 'object' && baseState !== null ? baseState : {}),
          [MARK]: token,
        },
        '',
        window.location.href
      )
    }

    const onPopState = (event: PopStateEvent): void => {
      if (!isPushed || readMark(event.state) === token) {
        return
      }

      // Ушли со своей записи — это и есть «закрыть». Роутеру здесь делать нечего.
      event.stopImmediatePropagation()
      openTokens.delete(token)
      tokenRef.current = null
      onCloseRef.current()
    }

    if (pendingPops > 0) {
      waitingPushes.add(push)
    } else {
      push()
    }

    window.addEventListener('popstate', onPopState, { capture: true })

    return () => {
      window.removeEventListener('popstate', onPopState, { capture: true })
      waitingPushes.delete(push)
      openTokens.delete(token)
      tokenRef.current = null

      if (!isPushed) {
        return
      }

      const isStillCurrent = readMark(window.history.state) === token
      const isNavigating = performance.now() - lastLinkClickAt < LINK_CLICK_GRACE_MS

      if (isStillCurrent && !isNavigating) {
        goBack(true)
      }
    }
  }, [isOpen])

  return useCallback(() => {
    const token = tokenRef.current

    if (token !== null && readMark(window.history.state) === token) {
      // Закроет слушатель `popstate` — тем же путём, что и жест.
      goBack(false)

      return
    }

    onCloseRef.current()
  }, [])
}
