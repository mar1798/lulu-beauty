import type { IncomingHttpHeaders } from 'node:http'
import { serverConfig } from '@/сonfig'
import { EMBEDDED_HEADER } from '@/utils/embedding'

/**
 * JWT живут только здесь — в httpOnly-cookie, которые ставит сервер Next.
 * Браузерный JS их не видит: `document.cookie` для httpOnly пуст, а прокси
 * подставляет `Authorization` уже на сервере.
 */

/**
 * Типы запроса и ответа описаны структурно, а не как `NextApiRequest`/
 * `NextApiResponse`: те же cookie читает и переставляет `getServerSideProps`,
 * где приходят «голые» `IncomingMessage`/`ServerResponse`. Через `Pick<>`
 * это не выразить — у `ServerResponse.setHeader` возвращаемый `this` уже
 * другой, и присваивание не проходит по типам.
 */
export interface ICookieRequest {
  cookies: Partial<Record<string, string>>
}

export interface ICookieResponse {
  getHeader: (name: string) => number | string | string[] | undefined
  setHeader: (name: string, value: string | string[]) => unknown
}

export const ACCESS_COOKIE = 'lb_at'
export const REFRESH_COOKIE = 'lb_rt'

/**
 * Незавершённый вход через Telegram: `<id сессии>:<секрет опроса>`.
 *
 * Секрет живёт здесь, а не в JS вкладки, по той же причине, что и токены:
 * `payload` из ссылки видно в переписке с ботом, и если бы опрос шёл по нему,
 * подтверждённый вход мог бы забрать любой, кто эту переписку увидел.
 */
export const LOGIN_SESSION_COOKIE = 'lb_ls'

/**
 * Срок жизни самих cookie равен сроку refresh-токена (`JWT_REFRESH_TTL_SECONDS`,
 * по умолчанию 30 дней). Access-cookie живёт столько же намеренно: её задача —
 * донести токен до сервера, а протухание определяет `exp` внутри JWT (15 минут),
 * после чего прокси молча обновляет пару.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export interface IAuthTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Откуда пришёл запрос, ради которого ставятся cookie: из обычной вкладки или из
 * фрейма Telegram Web (`utils/embedding.ts`). От этого зависят атрибуты, а снимать
 * cookie надо теми же атрибутами, какими ставили, — иначе браузер сочтёт их
 * другими и оставит на месте.
 */
export interface ICookieOrigin {
  headers?: IncomingHttpHeaders
}

/**
 * Во фрейме — `SameSite=None; Secure; Partitioned`, но только поверх HTTPS:
 * `None` и `Partitioned` без `Secure` браузер отбрасывает целиком. В разработке
 * по http фрейм Telegram всё равно не откроется, и там остаётся `Lax`.
 *
 * `Partitioned` (CHIPS) держит такие cookie в банке, привязанной к сайту верхнего
 * уровня: их видит только наш фрейм внутри Telegram Web, а не любой сайт, который
 * вздумал бы нас встроить или отправить на нас запрос. Защиту от CSRF, которую в
 * обычной вкладке даёт `Lax`, здесь держит проверка происхождения
 * (`server/sameOrigin.ts`) — на `/api/auth/*` и на изменяющих запросах прокси.
 */
const isEmbeddedRequest = (origin: ICookieOrigin): boolean =>
  origin.headers?.[EMBEDDED_HEADER.toLowerCase()] === '1' && serverConfig('authCookieSecure')

const serialize = (name: string, value: string, maxAge: number, origin: ICookieOrigin): string => {
  const isEmbedded = isEmbeddedRequest(origin)
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    isEmbedded ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]

  if (serverConfig('authCookieSecure')) {
    parts.push('Secure')
  }

  if (isEmbedded) {
    parts.push('Partitioned')
  }

  return parts.join('; ')
}

/** Дописывает `Set-Cookie`, не затирая уже выставленные заголовки ответа. */
const appendSetCookie = (res: ICookieResponse, cookies: string[]): void => {
  const existing = res.getHeader('Set-Cookie')
  const before = Array.isArray(existing) ? existing : typeof existing === 'string' ? [existing] : []

  res.setHeader('Set-Cookie', [...before, ...cookies])
}

export const setAuthCookies = (
  res: ICookieResponse,
  tokens: IAuthTokens,
  origin: ICookieOrigin
): void => {
  appendSetCookie(res, [
    serialize(ACCESS_COOKIE, tokens.accessToken, MAX_AGE_SECONDS, origin),
    serialize(REFRESH_COOKIE, tokens.refreshToken, MAX_AGE_SECONDS, origin),
  ])
}

export const clearAuthCookies = (res: ICookieResponse, origin: ICookieOrigin): void => {
  appendSetCookie(res, [
    serialize(ACCESS_COOKIE, '', 0, origin),
    serialize(REFRESH_COOKIE, '', 0, origin),
  ])
}

/** Чуть больше срока самой сессии на бэке (`AUTH_SESSION_TTL_SECONDS`): протухнуть она должна там, а не здесь. */
const LOGIN_SESSION_MAX_AGE_SECONDS = 15 * 60

export interface ILoginSession {
  sessionId: string
  pollSecret: string
}

export const setLoginSession = (
  res: ICookieResponse,
  session: ILoginSession,
  origin: ICookieOrigin
): void => {
  appendSetCookie(res, [
    serialize(
      LOGIN_SESSION_COOKIE,
      `${session.sessionId}:${session.pollSecret}`,
      LOGIN_SESSION_MAX_AGE_SECONDS,
      origin
    ),
  ])
}

export const clearLoginSession = (res: ICookieResponse, origin: ICookieOrigin): void => {
  appendSetCookie(res, [serialize(LOGIN_SESSION_COOKIE, '', 0, origin)])
}

export const readLoginSession = (req: ICookieRequest): ILoginSession | null => {
  const raw = req.cookies[LOGIN_SESSION_COOKIE]

  if (raw === undefined || raw === '') {
    return null
  }

  // Секрет — base64url, двоеточий в нём не бывает; режем по первому на всякий случай.
  const separator = raw.indexOf(':')

  if (separator <= 0) {
    return null
  }

  return { sessionId: raw.slice(0, separator), pollSecret: raw.slice(separator + 1) }
}

export const readAuthTokens = (req: ICookieRequest): Partial<IAuthTokens> => ({
  accessToken: req.cookies[ACCESS_COOKIE],
  refreshToken: req.cookies[REFRESH_COOKIE],
})
