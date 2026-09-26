/**
 * Сайт, открытый внутри Telegram (Mini App), — как это распознать и чем доказать вход.
 *
 * Telegram кладёт подписанные данные во **фрагмент** адреса (`#tgWebAppData=...`) и
 * оттуда же их читает собственный `telegram-web-app.js`. Читаем фрагмент напрямую, а не
 * через скрипт, намеренно: подпись всё равно проверяется на бэкенде, а вход, зависящий
 * от загрузки чужого скрипта, ломается ровно там, где сеть хуже всего — в мобильном
 * webview. Скрипт нужен для другого (`ready`/`expand`, кнопка «Назад»), и его отсутствие
 * ничего не ломает — см. `loadTelegramWebApp`.
 */

const INIT_DATA_PARAM = 'tgWebAppData'

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'

interface ITelegramBackButton {
  show: () => void
  hide: () => void
  onClick: (callback: () => void) => void
  offClick: (callback: () => void) => void
}

interface ITelegramWebApp {
  ready: () => void
  expand: () => void
  BackButton?: ITelegramBackButton
  /** С Bot API 6.9 — есть почти везде, но проверяем: старые клиенты живы. */
  isVersionAtLeast?: (version: string) => boolean
  /** Bot API 8.0: Telegram сам скачивает файл по адресу, спросив человека. */
  downloadFile?: (params: { url: string; file_name: string }) => void
  /** Открыть адрес во внешнем браузере. */
  openLink?: (url: string) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: ITelegramWebApp }
  }
}

/**
 * Подписанные данные запуска или `null`, если страницу открыли не из Telegram.
 *
 * Строка возвращается ровно в том виде, в каком её собрал Telegram: подпись считается
 * по ней, и пересборка из разобранных пар рано или поздно переэкранирует один символ.
 */
/**
 * Подпись, прочитанная при первом открытии. Фрагмент живёт в адресе только до первого
 * перехода внутри сайта, а подпись нужна и позже — повторить вход, когда человек
 * вернулся из бота уже зарегистрированным.
 */
let cachedInitData: string | null = null

export const readMiniAppInitData = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  if (cachedInitData !== null) {
    return cachedInitData
  }

  const fragment = window.location.hash.replace(/^#/, '')

  if (fragment === '') {
    return null
  }

  const initData = new URLSearchParams(fragment).get(INIT_DATA_PARAM)

  if (initData === null || initData === '') {
    return null
  }

  cachedInitData = initData

  return initData
}

/**
 * Telegram-id того, кто открыл Mini App, — из поля `user` подписанных данных.
 *
 * Проверять подпись здесь незачем: число нужно только чтобы заметить, что сессия
 * принадлежит другому аккаунту, а сам вход всё равно пройдёт проверку на бэкенде.
 */
export const readMiniAppUserId = (initData: string): number | null => {
  const raw = new URLSearchParams(initData).get('user')

  if (raw === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) {
      const { id } = parsed

      return typeof id === 'number' ? id : null
    }
  } catch {
    // Испорченное поле — то же, что его отсутствие.
  }

  return null
}

/**
 * Один запрос скрипта на загрузку страницы. Эффекты, которым он нужен, перезапускаются
 * на каждой смене состояния сессии, а `window.Telegram` появляется не мгновенно — без
 * общего обещания в `<head>` уехало бы несколько копий одного и того же тега.
 */
let sdkPromise: Promise<ITelegramWebApp | null> | null = null

/**
 * Скрипт Telegram, загруженный один раз, или `null`, если он не загрузился.
 *
 * Всё, что через него делается, — косметика и удобство: не загрузился скрипт — магазин
 * работает, просто без системной кнопки «Назад».
 */
export const loadTelegramWebApp = (): Promise<ITelegramWebApp | null> => {
  if (window.Telegram?.WebApp !== undefined) {
    return Promise.resolve(window.Telegram.WebApp)
  }

  if (sdkPromise !== null) {
    return sdkPromise
  }

  sdkPromise = new Promise(resolve => {
    const script = document.createElement('script')

    script.src = SDK_URL
    script.async = true
    script.onload = (): void => resolve(window.Telegram?.WebApp ?? null)
    script.onerror = (): void => resolve(null)
    document.head.appendChild(script)
  })

  return sdkPromise
}

/**
 * Говорит Telegram, что можно убрать заставку, и разворачивает окно на весь экран.
 *
 * Первыми эти события шлёт маленький скрипт в `_document` — ещё до гидрации, чтобы
 * заставка не закрывала готовую страницу. Здесь — повтор через официальный скрипт, на
 * случай если мост того скрипта в этом клиенте не сработал.
 */
export const announceReady = (): void => {
  void loadTelegramWebApp().then(app => {
    app?.ready()
    app?.expand()
  })
}

/**
 * Inline-скрипт для `<head>`: шлёт `web_app_ready` и `web_app_expand` сразу, не дожидаясь
 * ни гидрации, ни загрузки `telegram-web-app.js`.
 *
 * Мосты те же, что у официального скрипта: `TelegramWebviewProxy` в мобильных
 * клиентах, `external.notify` в старых десктопных, `postMessage` родителю в
 * Telegram Web. В событиях нет ничего секретного, поэтому получатель `'*'`.
 */
export const EARLY_READY_SCRIPT = `(function(){try{
if(location.hash.indexOf('${INIT_DATA_PARAM}=')===-1)return;
function post(t){var d='';
if(window.TelegramWebviewProxy){window.TelegramWebviewProxy.postEvent(t,d);return}
if(window.external&&'notify' in window.external){window.external.notify(JSON.stringify({eventType:t,eventData:d}));return}
if(window.parent!==window){window.parent.postMessage(JSON.stringify({eventType:t,eventData:d}),'*')}}
post('web_app_ready');post('web_app_expand');
}catch(e){}})()`
