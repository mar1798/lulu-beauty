/**
 * Куда вернуть пользователя после входа.
 *
 * Адрес приходит из query (`/login?next=/admin/orders`), то есть снаружи, и
 * подставлять его в редирект как есть нельзя: `?next=https://evil.example`
 * превратил бы страницу входа в открытый редирект. Пропускаем только
 * относительные пути одного слэша.
 */

export const DEFAULT_REDIRECT = '/catalog'

/**
 * Второй символ пути. `//` браузер трактует как внешний адрес с текущей
 * схемой, а `\` по спецификации URL для http(s) равен `/` — то есть
 * `/\evil.example` разбирается ровно в `https://evil.example/` и одной
 * проверки на `//` мало.
 */
const AUTHORITY_START = /^[/\\][/\\]/

export const safeRedirectPath = (value: unknown, fallback = DEFAULT_REDIRECT): string => {
  const path = Array.isArray(value) ? value[0] : value

  if (typeof path !== 'string' || !path.startsWith('/') || AUTHORITY_START.test(path)) {
    return fallback
  }

  return path
}
