import type { NextApiRequest, NextApiResponse } from 'next'
import {
  UnauthenticatedError,
  methodNotAllowed,
  refreshTokens,
  unauthenticated,
} from '@/server/apiFetch'

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

  try {
    await refreshTokens(req, res)
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      unauthenticated(res)
      return
    }

    throw error
  }

  res.status(204).end()
}

export default handler
