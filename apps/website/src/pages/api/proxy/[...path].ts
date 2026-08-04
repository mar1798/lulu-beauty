import type { NextApiRequest, NextApiResponse } from 'next'
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { UnauthenticatedError, fetchWithAuth, unauthenticated } from '@/server/apiFetch'

/**
 * Прозрачный прокси к бэкенду для браузера. Единственное, что он добавляет, —
 * `Authorization: Bearer <access>` из httpOnly-cookie и молчаливое обновление
 * пары токенов, когда access протух.
 *
 * Тело не буферизуется (`bodyParser: false`), поэтому загрузка изображений и
 * импорт каталога идут потоком, не оседая в памяти Next.
 */
export const config = { api: { bodyParser: false } }

/** Методы без тела — только их можно безопасно повторить после обновления токена. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE'])

/** Заголовки запроса, которые имеет смысл донести до бэкенда. */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'content-length', 'accept', 'accept-language']

/** Заголовки ответа, важные для клиента (в т.ч. имя файла выгрузки по RFC 5987). */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'cache-control']

const requestHeaders = (req: NextApiRequest): Record<string, string> => {
  const headers: Record<string, string> = {}

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name]

    if (typeof value === 'string') {
      headers[name] = value
    }
  }

  return headers
}

const targetPath = (req: NextApiRequest): string => {
  const segments = req.query.path

  if (segments === undefined) {
    return '/'
  }

  const parts = Array.isArray(segments) ? segments : [segments]

  return `/${parts.map(part => encodeURIComponent(part)).join('/')}`
}

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const path = targetPath(req)

  // Ручки авторизации доступны только через /api/auth/*: иначе ответ с парой
  // JWT ушёл бы в браузер, ради чего вся эта схема с cookie и затевалась.
  if (path === '/auth' || path.startsWith('/auth/')) {
    res.status(404).json({ detail: 'not_found' })
    return
  }

  const method = req.method ?? 'GET'
  const bodyless = BODYLESS_METHODS.has(method)
  const search = req.url?.split('?')[1] ?? ''

  let response: Response

  try {
    response = await fetchWithAuth(
      req,
      res,
      path,
      search,
      {
        method,
        headers: requestHeaders(req),
        body: bodyless ? undefined : req,
        // Потоковое тело читается один раз — повтор после 401 невозможен.
        // Его заменяет упреждающее обновление токена по `exp` в fetchWithAuth.
        retryable: bodyless,
      },
      { auth: 'optional' }
    )
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      unauthenticated(res)
      return
    }

    throw error
  }

  res.status(response.status)

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name)

    if (value !== null) {
      res.setHeader(name, value)
    }
  }

  if (response.body === null) {
    res.end()
    return
  }

  await pipeline(Readable.fromWeb(response.body as ReadableStream), res)
}

export default handler
