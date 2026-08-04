import { serverConfig } from '@/сonfig'
import { ApiError, toApiError } from './apiErrors'

/**
 * Тонкий HTTP-клиент над `fetch`. Ничего не знает про конкретные ручки —
 * только про два адресата:
 *
 * - `api` — сам бэкенд. В браузере запрос идёт через Next-прокси `/api/proxy/*`,
 *   который подставляет `Authorization` из httpOnly-cookie (JWT в браузер
 *   не попадают никогда). На сервере (getStaticProps / API routes) — напрямую
 *   по `API_BASE_URL`, без авторизации: так тянутся только публичные данные.
 * - `nextApi` — собственные ручки Next (`/api/auth/*`). Только из браузера.
 */

const PROXY_PREFIX = '/api/proxy'
const NEXT_API_PREFIX = '/api'

const isBrowser = (): boolean => typeof window !== 'undefined'

type Target = 'api' | 'next'

export type QueryValue = string | number | boolean | undefined | null

export interface IRequestOptions {
  query?: Record<string, QueryValue>
  /** Объект сериализуется в JSON; `FormData` уходит как есть (boundary выставит браузер). */
  body?: unknown
  signal?: AbortSignal
}

const baseUrl = (target: Target): string => {
  if (target === 'next') {
    if (!isBrowser()) {
      throw new Error('Ручки /api/* Next вызываются только из браузера')
    }

    return NEXT_API_PREFIX
  }

  return isBrowser() ? PROXY_PREFIX : serverConfig('apiBaseUrl')
}

export const buildQuery = (query: Record<string, QueryValue> | undefined): string => {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      search.append(key, String(value))
    }
  }

  return search.toString()
}

const buildUrl = (target: Target, path: string, query?: Record<string, QueryValue>): string => {
  const search = buildQuery(query)

  return `${baseUrl(target)}${path}${search === '' ? '' : `?${search}`}`
}

const isFormData = (body: unknown): body is FormData =>
  typeof FormData !== 'undefined' && body instanceof FormData

const buildInit = (method: string, options: IRequestOptions): RequestInit => {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const hasBody = options.body !== undefined
  const form = isFormData(options.body)

  if (hasBody && !form) {
    headers['Content-Type'] = 'application/json'
  }

  return {
    method,
    headers,
    credentials: 'same-origin',
    signal: options.signal,
    body: hasBody ? (form ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
  }
}

/** `fetch`, у которого любая сетевая осечка тоже становится `ApiError`. */
const send = async (url: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }

    throw new ApiError(0, 'network_error')
  }
}

const NO_CONTENT = 204

const request = async <T>(
  target: Target,
  method: string,
  path: string,
  options: IRequestOptions = {}
): Promise<T> => {
  const response = await send(buildUrl(target, path, options.query), buildInit(method, options))

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === NO_CONTENT) {
    return undefined as unknown as T
  }

  return (await response.json()) as T
}

export interface IApiClient {
  get: <T>(path: string, options?: IRequestOptions) => Promise<T>
  post: <T>(path: string, options?: IRequestOptions) => Promise<T>
  patch: <T>(path: string, options?: IRequestOptions) => Promise<T>
  remove: <T>(path: string, options?: IRequestOptions) => Promise<T>
  /** Абсолютный URL — нужен там, где скачивание отдаётся браузеру (`<a download>`). */
  url: (path: string, query?: Record<string, QueryValue>) => string
}

const createClient = (target: Target): IApiClient => ({
  get: (path, options) => request(target, 'GET', path, options),
  post: (path, options) => request(target, 'POST', path, options),
  patch: (path, options) => request(target, 'PATCH', path, options),
  remove: (path, options) => request(target, 'DELETE', path, options),
  url: (path, query) => buildUrl(target, path, query),
})

export const api = createClient('api')
export const nextApi = createClient('next')

export interface IDownload {
  blob: Blob
  filename: string | null
}

const FILENAME_UTF8 = /filename\*=UTF-8''([^;]+)/i
const FILENAME_PLAIN = /filename="?([^";]+)"?/i

/** Имя файла из `Content-Disposition`; RFC 5987 (`filename*=UTF-8''…`) имеет приоритет. */
export const filenameFromDisposition = (disposition: string | null): string | null => {
  if (disposition === null) {
    return null
  }

  const utf8 = FILENAME_UTF8.exec(disposition)

  if (utf8?.[1] !== undefined) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      return utf8[1]
    }
  }

  return FILENAME_PLAIN.exec(disposition)?.[1] ?? null
}

/** Скачивание бинарника (выгрузка заказов в xlsx) — тоже через прокси, с cookie. */
export const download = async (
  path: string,
  query?: Record<string, QueryValue>
): Promise<IDownload> => {
  const response = await send(buildUrl('api', path, query), {
    method: 'GET',
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('content-disposition')),
  }
}
