import type { IncomingHttpHeaders } from 'node:http'
import { serverConfig } from '@/сonfig'

/**
 * Адрес посетителя — для лимитера частоты на бэкенде.
 *
 * Без него API видит один-единственный адрес (прокси Next) для всех сразу, и
 * анонимный лимит — тот, что защищает `POST /auth/telegram/session`, — стал бы
 * общим на весь магазин: один нетерпеливый гость закрывал бы вход остальным.
 * Авторизованные запросы бэкенд считает по `sub` из подписанного токена, так что
 * заголовок нужен ровно там, где токена ещё нет.
 *
 * Входящий `x-forwarded-for` читается только при `TRUST_PROXY_HEADERS=true`.
 * Заголовок ставит балансировщик, но выставить его может и браузер, а Next не
 * знает, стоит ли перед ним кто-нибудь: поверив ему без разбора, мы бы раздали
 * каждому гостю бесконечный запас личностей — то есть отменили бы лимит.
 * По умолчанию берётся адрес соединения, что верно для Next, смотрящего наружу
 * напрямую (в том числе в docker compose).
 */

export interface IClientRequest {
  headers: IncomingHttpHeaders
  socket?: { remoteAddress?: string | undefined } | undefined
}

const HEADER = 'X-Forwarded-For'

const forwarded = (headers: IncomingHttpHeaders): string | undefined => {
  const raw = headers['x-forwarded-for']
  const value = Array.isArray(raw) ? raw[0] : raw

  // Крайний левый — исходный клиент, дальше идут прокси, дописавшие себя.
  return value?.split(',')[0]?.trim() || undefined
}

export const clientAddress = (req: IClientRequest): string | undefined =>
  (serverConfig('trustProxyHeaders') ? forwarded(req.headers) : undefined) ??
  req.socket?.remoteAddress ??
  undefined

/**
 * Заголовки клиента для запроса к API. Именно **ставит** `X-Forwarded-For`, а не
 * пересылает: то, что пришло из браузера, здесь уже отброшено (см. выше).
 */
export const clientHeaders = (req: IClientRequest): Record<string, string> => {
  const address = clientAddress(req)

  return address === undefined ? {} : { [HEADER]: address }
}
