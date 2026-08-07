import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed, relayJson } from '@/server/apiFetch'
import { setAuthCookies, type IAuthTokens } from '@/server/cookies'

/**
 * Подтверждение кода и новый пароль разом. Как и `verify-otp`, при успехе
 * сразу открывает сессию: ответ бэкенда раскладывается по httpOnly-cookie,
 * а наружу уходит готовый профиль вместо голых токенов.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const response = await fetch(apiUrl('/auth/reset-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  })

  if (!response.ok) {
    await relayJson(res, response)
    return
  }

  const tokens = (await response.json()) as IAuthTokens

  setAuthCookies(res, tokens)

  const profile = await fetch(apiUrl('/users/me'), {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })

  await relayJson(res, profile)
}

export default handler
