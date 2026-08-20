import type { NextApiRequest, NextApiResponse } from 'next'
import {
  UnauthenticatedError,
  UpstreamUnavailableError,
  methodNotAllowed,
  refreshTokens,
  unauthenticated,
} from '@/server/apiFetch'
import { rejectCrossOrigin } from '@/server/sameOrigin'

/**
 * Явное обновление пары токенов. В обычной жизни не нужно — прокси обновляет
 * их сам, — но клиент может дёрнуть эту ручку, чтобы продлить сессию
 * (например, вернувшись на вкладку через час).
 *
 * Обновляются **обе** cookie: бэкенд ротирует и refresh-токен, старый отзывается.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  // Ручка меняет cookie сессии — значит, она мишень для CSRF (см. sameOrigin.ts).
  if (rejectCrossOrigin(req, res)) {
    return
  }

  try {
    await refreshTokens(req, res)
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      unauthenticated(res)
      return
    }

    // API недоступен или занят — сессия при этом цела (cookie не тронуты),
    // поэтому отвечаем «попробуйте позже», а не 401: 401 клиент трактует как
    // «вы гость» и уводит на страницу входа.
    if (error instanceof UpstreamUnavailableError) {
      res.status(503).json({ detail: 'upstream_unavailable' })
      return
    }

    throw error
  }

  res.status(204).end()
}

export default handler
