import type { NextApiRequest, NextApiResponse } from 'next'
import {
  UnauthenticatedError,
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

    throw error
  }
}

export default handler
