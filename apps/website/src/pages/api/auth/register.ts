import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed, relayJson } from '@/server/apiFetch'

/**
 * Регистрация: только отправляет OTP, токенов на этом шаге нет —
 * cookie появятся после `/api/auth/verify-otp`.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const response = await fetch(apiUrl('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  })

  await relayJson(res, response)
}

export default handler
