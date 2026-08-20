import type { NextApiRequest, NextApiResponse } from 'next'
import {
  UnauthenticatedError,
  UpstreamUnavailableError,
  fetchWithAuth,
  methodNotAllowed,
  relayJson,
  unauthenticated,
} from '@/server/apiFetch'

/**
 * Профиль текущего пользователя. Клиент дёргает его при загрузке приложения,
 * чтобы понять, залогинен ли он: cookie httpOnly, и другого способа узнать нет.
 * 401 здесь — нормальный ответ для гостя, а не ошибка.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }

  try {
    const response = await fetchWithAuth(req, res, '/users/me', '', { method: 'GET' }, {
      auth: 'required',
    })

    await relayJson(res, response)
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      unauthenticated(res)
      return
    }

    // Апстрим недоступен — сессия цела, поэтому это 503, а не 401: пометить
    // посетителя гостем из-за 502 значит выкинуть его из аккаунта.
    if (error instanceof UpstreamUnavailableError) {
      res.status(503).json({ detail: 'upstream_unavailable' })
      return
    }

    throw error
  }
}

export default handler
