import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed } from '@/server/apiFetch'
import { clientHeaders } from '@/server/clientAddress'
import { setLoginSession } from '@/server/cookies'

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

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const response = await fetch(apiUrl('/auth/telegram/session'), {
    method: 'POST',
    // Единственная анонимная ручка, которая пишет в базу: ради неё у бэкенда и
    // появился строгий лимит, а он бесполезен, пока все гости выглядят одинаково.
    headers: { 'Content-Type': 'application/json', ...clientHeaders(req) },
    body: '{}',
  })

  if (!response.ok) {
    res.status(response.status).json({ detail: 'auth_session_not_started' })
    return
  }

  const started = (await response.json()) as IStartedSession

  setLoginSession(res, { sessionId: started.sessionId, pollSecret: started.pollSecret })
  res.status(200).json({ botUrl: started.botUrl, expiresAt: started.expiresAt })
}

export default handler
