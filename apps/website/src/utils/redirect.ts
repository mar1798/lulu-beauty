/**
 * Куда вернуть пользователя после входа.
 *
 * Адрес приходит из query (`/login?next=/admin/orders`), то есть снаружи, и
 * подставлять его в редирект как есть нельзя: `?next=https://evil.example`
 * превратил бы страницу входа в открытый редирект. Пропускаем только
 * относительные пути одного слэша — `//host` браузер трактует как внешний
 * адрес с текущей схемой.
 */

export const DEFAULT_REDIRECT = '/catalog'

export const safeRedirectPath = (value: unknown, fallback = DEFAULT_REDIRECT): string => {
  const path = Array.isArray(value) ? value[0] : value

  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return fallback
  }

  return path
}
