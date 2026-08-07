import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed, relayJson } from '@/server/apiFetch'

/**
 * Запрос кода для смены пароля. Как и `login`, отдаёт только «код отправлен»
 * — токены выдаст второй шаг, `POST /auth/reset-password`.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const response = await fetch(apiUrl('/auth/forgot-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  })

  await relayJson(res, response)
}

export default handler
