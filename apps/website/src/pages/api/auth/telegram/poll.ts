import type { NextApiRequest, NextApiResponse } from 'next'
import { apiUrl, methodNotAllowed } from '@/server/apiFetch'
import { clientHeaders } from '@/server/clientAddress'
import { clearLoginSession, readLoginSession, setAuthCookies } from '@/server/cookies'
import { rejectCrossOrigin } from '@/server/sameOrigin'

/**
 * Опрос из вкладки: подтвердил ли человек вход в боте.
 *
 * Ответ бэкенда либо «ещё ждём», либо пара токенов — и вот они-то в браузер не
 * уходят никогда: здесь они превращаются в httpOnly-cookie, а вкладке достаётся
 * профиль, как раньше доставался после ввода кода.
 */

const NOT_FOUND = 404
const GONE = 410

interface IClaimResponse {
  status: 'PENDING' | 'AUTHORIZED'
  tokens: { accessToken: string; refreshToken: string } | null
}

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  // Ручка меняет cookie сессии — значит, она мишень для CSRF (см. sameOrigin.ts).
  if (rejectCrossOrigin(req, res)) {
    return
  }

  const session = readLoginSession(req)

  if (session === null) {
    // Вкладку перезагрузили, cookie не дожила — начинать надо заново, а не ждать.
    res.status(404).json({ detail: 'auth_session_not_found' })
    return
  }

  const response = await fetch(apiUrl('/auth/telegram/claim'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeaders(req) },
    body: JSON.stringify(session),
  })

  if (!response.ok) {
    // Тупик — только когда бэкенд сказал, что сессии нет или она истекла. `lb_ls`
    // хранит единственную копию poll-секрета, браузеру она не видна: снеся cookie
    // по 429 или 502, мы теряем вход, который живёт на бэке ещё три минуты и вот-вот
    // будет подтверждён ботом. Транзиентный ответ просто пересылаем — вкладка
    // опросит снова.
    if (response.status === NOT_FOUND || response.status === GONE) {
      clearLoginSession(res)
    }

    const detail = (await response.json().catch(() => null)) as { detail?: string } | null
    res.status(response.status).json({ detail: detail?.detail ?? 'auth_session_not_found' })
    return
  }

  const claim = (await response.json()) as IClaimResponse

  if (claim.status !== 'AUTHORIZED' || claim.tokens === null) {
    res.status(200).json({ status: 'PENDING' })
    return
  }

  setAuthCookies(res, claim.tokens)
  clearLoginSession(res)

  /*
    Профиль тянем той же парой токенов, а не из cookie: `req.cookies` — это уже
    прочитанный запрос, выставленных мгновение назад cookie там нет.
  */
  const me = await fetch(apiUrl('/users/me'), {
    headers: { Authorization: `Bearer ${claim.tokens.accessToken}`, ...clientHeaders(req) },
  })

  if (!me.ok) {
    res.status(200).json({ status: 'AUTHORIZED', user: null })
    return
  }

  res.status(200).json({ status: 'AUTHORIZED', user: await me.json() })
}

export default handler
