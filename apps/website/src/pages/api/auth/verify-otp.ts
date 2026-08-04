import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed, relayJson } from '@/server/apiFetch'
import { setAuthCookies, type IAuthTokens } from '@/server/cookies'

/**
 * Единственное место, где JWT вообще существуют в открытом виде: ответ бэкенда
 * тут же раскладывается по httpOnly-cookie и в браузер не уходит. Клиенту
 * возвращается сразу профиль — иначе после входа пришлось бы делать второй
 * запрос за `/users/me`.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const response = await fetch(apiUrl('/auth/verify-otp'), {
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
