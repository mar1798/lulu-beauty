import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed } from '@/server/apiFetch'
import { clientHeaders } from '@/server/clientAddress'
import { clearAuthCookies, readAuthTokens } from '@/server/cookies'

/**
 * Выход. Cookie снимаются в любом случае — даже если бэкенд недоступен или
 * refresh уже отозван: локальный выход не должен зависеть от сети.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const { refreshToken } = readAuthTokens(req)

  if (refreshToken !== undefined) {
    try {
      await fetch(apiUrl('/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...clientHeaders(req) },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
      // Сессию на бэке отзовёт истечение refresh-токена.
    }
  }

  clearAuthCookies(res)
  res.status(204).end()
}

export default handler
