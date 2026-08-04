import type { NextApiRequest, NextApiResponse } from 'next'
import type { Readable } from 'node:stream'
import { serverConfig } from '@/сonfig'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  readAuthTokens,
  setAuthCookies,
  type IAuthTokens,
} from './cookies'

/** Вызовы бэкенда с сервера Next: и анонимные, и с подстановкой Bearer из cookie. */

export const apiUrl = (path: string, search = ''): string =>
  `${serverConfig('apiBaseUrl')}${path}${search === '' ? '' : `?${search}`}`

/** Тело запроса: строка (JSON от нашей ручки) или поток (проксируемый upload). */
export type ApiBody = string | Readable | undefined

export interface IApiRequest {
  method: string
  headers?: Record<string, string>
  body?: ApiBody
  /**
   * Можно ли повторить запрос после обновления токена. Потоковое тело
   * читается ровно один раз, поэтому для аплоадов повтор невозможен —
   * его заменяет упреждающее обновление по `exp`.
   */
  retryable?: boolean
}

/** Не залогинен: cookie нет или refresh отвергнут бэкендом. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('not_authenticated')
    this.name = 'UnauthenticatedError'
  }
}

const UNAUTHORIZED = 401
const EXPIRY_SKEW_SECONDS = 30
const MILLISECONDS = 1000

/**
 * `exp` из access-JWT. Подпись здесь не проверяется намеренно: это лишь
 * подсказка «пора обновиться», настоящую проверку делает бэкенд.
 */
const accessTokenExpiry = (token: string): number | null => {
  const payload = token.split('.')[1]

  if (payload === undefined) {
    return null
  }

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const exp: unknown = (JSON.parse(json) as { exp?: unknown }).exp

    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

const isExpired = (token: string): boolean => {
  const exp = accessTokenExpiry(token)

  // Нечитаемый токен считаем протухшим — пусть его заменит refresh.
  return exp === null || exp - EXPIRY_SKEW_SECONDS <= Date.now() / MILLISECONDS
}

const sendApi = async (
  path: string,
  search: string,
  request: IApiRequest,
  accessToken: string | null
): Promise<Response> => {
  const headers: Record<string, string> = { ...request.headers }

  if (accessToken !== null) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const init: RequestInit = { method: request.method, headers, body: request.body as BodyInit }

  // undici требует duplex: 'half' для потокового тела запроса.
  if (request.body !== undefined && typeof request.body !== 'string') {
    ;(init as RequestInit & { duplex: string }).duplex = 'half'
  }

  return fetch(apiUrl(path, search), init)
}

/** Меняет пару токенов по refresh-cookie и переставляет cookie в ответе. */
export const refreshTokens = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string> => {
  const { refreshToken } = readAuthTokens(req)

  if (refreshToken === undefined) {
    throw new UnauthenticatedError()
  }

  const response = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) {
    clearAuthCookies(res)
    throw new UnauthenticatedError()
  }

  const tokens = (await response.json()) as IAuthTokens

  setAuthCookies(res, tokens)
  // Чтобы повторный вызов внутри этого же запроса взял уже новый токен.
  req.cookies[ACCESS_COOKIE] = tokens.accessToken
  req.cookies[REFRESH_COOKIE] = tokens.refreshToken

  return tokens.accessToken
}

export interface IAuthedFetchOptions {
  /**
   * `required` — без cookie сразу `UnauthenticatedError` (ручки профиля).
   * `optional` — без cookie запрос уходит анонимным: через прокси ходят и
   * публичные ручки каталога, и они не должны падать у неавторизованного гостя.
   */
  auth?: 'required' | 'optional'
}

export const fetchWithAuth = async (
  req: NextApiRequest,
  res: NextApiResponse,
  path: string,
  search: string,
  request: IApiRequest,
  options: IAuthedFetchOptions = {}
): Promise<Response> => {
  const { accessToken, refreshToken } = readAuthTokens(req)
  const anonymous = accessToken === undefined && refreshToken === undefined

  if (anonymous) {
    if (options.auth === 'required') {
      throw new UnauthenticatedError()
    }

    return sendApi(path, search, request, null)
  }

  const fresh = accessToken !== undefined && !isExpired(accessToken)
  const token = fresh ? accessToken : await refreshTokens(req, res)
  const response = await sendApi(path, search, request, token)

  if (response.status !== UNAUTHORIZED) {
    return response
  }

  if (request.retryable === false) {
    return response
  }

  const retried = await sendApi(path, search, request, await refreshTokens(req, res))

  if (retried.status === UNAUTHORIZED) {
    clearAuthCookies(res)
  }

  return retried
}

/** Пересылает ответ бэкенда как есть — статус и распарсенный JSON (или пустое тело). */
export const relayJson = async (res: NextApiResponse, response: Response): Promise<void> => {
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    res.status(response.status).end()
    return
  }

  const text = await response.text()

  if (text === '') {
    res.status(response.status).end()
    return
  }

  res
    .status(response.status)
    .setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json')
    .send(text)
}

export const methodNotAllowed = (res: NextApiResponse, allowed: string[]): void => {
  res.setHeader('Allow', allowed.join(', '))
  res.status(405).json({ detail: 'method_not_allowed' })
}

export const unauthenticated = (res: NextApiResponse): void => {
  res.status(UNAUTHORIZED).json({ detail: 'not_authenticated' })
}
