import type { NextApiRequest, NextApiResponse } from 'next'
import { serverConfig } from '@/сonfig'

/**
 * JWT живут только здесь — в httpOnly-cookie, которые ставит сервер Next.
 * Браузерный JS их не видит: `document.cookie` для httpOnly пуст, а прокси
 * подставляет `Authorization` уже на сервере.
 */

export const ACCESS_COOKIE = 'lb_at'
export const REFRESH_COOKIE = 'lb_rt'

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

const serialize = (name: string, value: string, maxAge: number): string => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]

  if (serverConfig('authCookieSecure')) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

/** Дописывает `Set-Cookie`, не затирая уже выставленные заголовки ответа. */
const appendSetCookie = (res: NextApiResponse, cookies: string[]): void => {
  const existing = res.getHeader('Set-Cookie')
  const before = Array.isArray(existing)
    ? existing
    : typeof existing === 'string'
      ? [existing]
      : []

  res.setHeader('Set-Cookie', [...before, ...cookies])
}

export const setAuthCookies = (res: NextApiResponse, tokens: IAuthTokens): void => {
  appendSetCookie(res, [
    serialize(ACCESS_COOKIE, tokens.accessToken, MAX_AGE_SECONDS),
    serialize(REFRESH_COOKIE, tokens.refreshToken, MAX_AGE_SECONDS),
  ])
}

export const clearAuthCookies = (res: NextApiResponse): void => {
  appendSetCookie(res, [serialize(ACCESS_COOKIE, '', 0), serialize(REFRESH_COOKIE, '', 0)])
}

export const readAuthTokens = (req: NextApiRequest): Partial<IAuthTokens> => ({
  accessToken: req.cookies[ACCESS_COOKIE],
  refreshToken: req.cookies[REFRESH_COOKIE],
})
