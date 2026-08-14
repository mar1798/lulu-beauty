/**
 * Сайт, открытый внутри Telegram (Mini App), — как это распознать и чем доказать вход.
 *
 * Telegram кладёт подписанные данные во **фрагмент** адреса (`#tgWebAppData=...`) и
 * оттуда же их читает собственный `telegram-web-app.js`. Читаем фрагмент напрямую, а не
 * через скрипт, намеренно: подпись всё равно проверяется на бэкенде, а вход, зависящий
 * от загрузки чужого скрипта, ломается ровно там, где сеть хуже всего — в мобильном
 * webview. Скрипт нужен для другого (`ready`/`expand`), и его отсутствие ничего не
 * ломает — см. `announceReady`.
 */

const INIT_DATA_PARAM = 'tgWebAppData'

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'

interface ITelegramWebApp {
  ready: () => void
  expand: () => void
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
export const readMiniAppInitData = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const fragment = window.location.hash.replace(/^#/, '')

  if (fragment === '') {
    return null
  }

  const initData = new URLSearchParams(fragment).get(INIT_DATA_PARAM)

  return initData === null || initData === '' ? null : initData
}

/**
 * Говорит Telegram, что можно убрать заставку, и разворачивает окно на весь экран.
 *
 * Всё это косметика, поэтому и живёт отдельно от входа: не загрузился скрипт — человек
 * увидит заставку на пару секунд дольше и полуэкранное окно, но магазин будет работать.
 */
/**
 * Один запрос скрипта на загрузку страницы. Эффект, который зовёт `announceReady`,
 * перезапускается на каждой смене состояния сессии, а `window.Telegram` появляется не
 * мгновенно — без флага в `<head>` уехало бы три копии одного и того же тега.
 */
let isSdkRequested = false

export const announceReady = (): void => {
  const start = (): void => {
    const app = window.Telegram?.WebApp

    if (app === undefined) {
      return
    }

    app.ready()
    app.expand()
  }

  if (window.Telegram?.WebApp !== undefined) {
    start()

    return
  }

  if (isSdkRequested) {
    return
  }

  isSdkRequested = true

  const script = document.createElement('script')

  script.src = SDK_URL
  script.async = true
  script.onload = start
  document.head.appendChild(script)
}
