import type { NextApiRequest, NextApiResponse } from 'next'
import { UpstreamUnavailableError, apiUrl, callApi, methodNotAllowed } from '@/server/apiFetch'
import { clientHeaders } from '@/server/clientAddress'
import { setLoginSession } from '@/server/cookies'
import { rejectCrossOrigin } from '@/server/sameOrigin'

/**
 * Начало входа: сервер заводит сессию и отдаёт браузеру **только** ссылку на бота.
 *
 * Секрет опроса остаётся здесь и уходит в httpOnly-cookie: в браузерном JS его
 * нет, как нет и токенов, — иначе ссылку из чата было бы достаточно, чтобы
 * забрать чужой подтверждённый вход.
 */

interface IStartedSession {
  sessionId: string
  pollSecret: string
  botUrl: string
  expiresAt: string
}

const TOO_MANY_REQUESTS = 429

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  // Ручка меняет cookie сессии — значит, она мишень для CSRF (см. sameOrigin.ts).
  if (rejectCrossOrigin(req, res)) {
    return
  }

  let response: Response

  try {
    response = await callApi(apiUrl('/auth/telegram/session'), {
      method: 'POST',
      // Единственная анонимная ручка, которая пишет в базу: ради неё у бэкенда и
      // появился строгий лимит, а он бесполезен, пока все гости выглядят одинаково.
      headers: { 'Content-Type': 'application/json', ...clientHeaders(req) },
      body: '{}',
    })
  } catch (error) {
    // API перезапускается — внятный 503 вместо голой страницы ошибки Next.
    if (error instanceof UpstreamUnavailableError) {
      res.status(error.status).json({ detail: 'upstream_unavailable' })
      return
    }

    throw error
  }

  if (!response.ok) {
    /*
      Код бэкенда доезжает до вкладки, как в `poll.ts`: 429 — это «подождите минуту»
      (`rate_limited`), а не «не удалось начать вход», после которого человек жмёт
      «повторить» и снова упирается в лимит.
    */
    res.status(response.status).json({
      detail: response.status === TOO_MANY_REQUESTS ? 'rate_limited' : 'auth_session_not_started',
    })
    return
  }

  const started = (await response.json()) as IStartedSession

  setLoginSession(res, { sessionId: started.sessionId, pollSecret: started.pollSecret }, req)
  res.status(200).json({ botUrl: started.botUrl, expiresAt: started.expiresAt })
}

export default handler
