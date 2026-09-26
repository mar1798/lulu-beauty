/**
 * Сайт, открытый во фрейме чужой страницы, — на деле только Telegram Web
 * (`web.telegram.org`), который так показывает Mini App: `frame-ancestors` в
 * `next.config.js` никого другого не пускает.
 *
 * Во фрейме наши cookie — сторонние: `SameSite=Lax` браузер в таком контексте не
 * сохраняет и не отправляет, и человек выглядел вошедшим, а корзина и оформление
 * отвечали 401. Поэтому страница во фрейме помечает каждый свой запрос этим
 * заголовком, и сервер Next ставит ей cookie `SameSite=None; Secure; Partitioned`
 * (`server/cookies.ts`) — в отдельной банке, привязанной к Telegram Web.
 *
 * Заголовок не секрет и ничего не открывает: он решает только, какими атрибутами
 * пометить cookie. Чужая страница его не пришлёт без CORS-preflight, а свой же
 * запрос, помеченный зря, просто получит partitioned-cookie.
 */
export const EMBEDDED_HEADER = 'X-LB-Embedded'

/** Открыта ли страница во фрейме. Доступ к `window.top` из чужого фрейма бросает — это тоже «да». */
export const isEmbeddedWindow = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
