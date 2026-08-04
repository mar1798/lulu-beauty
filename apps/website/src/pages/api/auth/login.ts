import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed, relayJson } from '@/server/apiFetch'

/**
 * Вход по паролю. Пара логин/пароль проверяется бэкендом, но токены он выдаёт
 * не здесь: в ответ уходит только «OTP отправлен» — второй шаг обязателен.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const response = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  })

  await relayJson(res, response)
}

export default handler
