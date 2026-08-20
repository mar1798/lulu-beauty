/**
 * Куда вернуть пользователя после входа.
 *
 * Адрес приходит из query (`/login?next=/admin/orders`), то есть снаружи, и
 * подставлять его в редирект как есть нельзя: `?next=https://evil.example`
 * превратил бы страницу входа в открытый редирект. Пропускаем только
 * относительные пути одного слэша.
 */

export const DEFAULT_REDIRECT = '/catalog'

/** Origin, относительно которого разбирается путь. Никогда не покидает этот модуль. */
const LOCAL_BASE = 'http://local'

/**
 * Разбираем адрес тем же парсером, что и браузер, вместо проверки первых двух
 * символов.
 *
 * Посимвольная проверка на `//` и `/\` ловила не всё: WHATWG-парсер выкидывает
 * TAB, LF и CR **до** разбора, поэтому `"/\t/evil.example"` внешне выглядел
 * относительным путём, а `resolveHref` в Next разворачивал его в
 * `http://evil.example/` — и роутер уходил на чужой домен через
 * `window.location`. Здесь такой адрес просто меняет origin и отсекается.
 */
export const safeRedirectPath = (value: unknown, fallback = DEFAULT_REDIRECT): string => {
  const path = Array.isArray(value) ? value[0] : value

  if (typeof path !== 'string' || !path.startsWith('/')) {
    return fallback
  }

  let parsed: URL

  try {
    parsed = new URL(path, LOCAL_BASE)
  } catch {
    return fallback
  }

  if (parsed.origin !== LOCAL_BASE) {
    return fallback
  }

  // Собираем обратно из разобранных частей, а не возвращаем исходную строку:
  // именно так адрес увидит роутер, и никаких «съеденных» парсером символов в
  // нём уже не останется.
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
