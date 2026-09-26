import type { NextApiRequest, NextApiResponse } from 'next'
import { UpstreamUnavailableError, apiUrl, callApi } from '@/server/apiFetch'
import { clientHeaders } from '@/server/clientAddress'
import { setAuthCookies, type IAuthTokens } from '@/server/cookies'

/**
 * Вход, который Telegram подтвердил подписью, — виджетом на сайте или изнутри Mini App.
 *
 * Отличается от `telegram/poll` только тем, чем доказана личность: там вкладка ждала
 * бота, здесь подпись приезжает сразу и ждать нечего. Всё остальное — то же самое и по
 * той же причине: токены превращаются в httpOnly-cookie здесь, на сервере Next, и в
 * браузерный JS не попадают ни на одном шаге.
 *
 * Тело запроса пересылается **как есть**: подпись Telegram считается по всем полям
 * payload, и любая нормализация по дороге (переименование ключей в camelCase, отбрасывание
 * «ненужных» `photo_url`/`username`) ломает проверку на бэкенде.
 */

interface ITokensResponse {
  accessToken: string
  refreshToken: string
}

export const signInThroughTelegram = async (
  req: NextApiRequest,
  res: NextApiResponse,
  path: string,
  body: unknown
): Promise<void> => {
  let response: Response

  try {
    response = await callApi(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientHeaders(req) },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof UpstreamUnavailableError) {
      res.status(error.status).json({ detail: 'upstream_unavailable' })

      return
    }

    throw error
  }

  if (!response.ok) {
    /*
      Код бэкенда доезжает до вкладки нетронутым: `telegram_account_not_linked` —
      единственная поправимая из этих ошибок, и поправить её можно только в боте.
      Общее «не удалось войти» отправило бы человека искать проблему на сайте.
    */
    const detail = (await response.json().catch(() => null)) as { detail?: string } | null

    res.status(response.status).json({ detail: detail?.detail ?? 'telegram_auth_invalid' })

    return
  }

  const tokens = (await response.json()) as ITokensResponse

  setAuthCookies(res, tokens as IAuthTokens, req)

  /*
    Профиль тянем той же парой токенов, а не из cookie: `req.cookies` — уже прочитанный
    запрос, выставленных мгновение назад cookie там нет (то же, что в `telegram/poll`).
  */
  const me = await callApi(apiUrl('/users/me'), {
    headers: { Authorization: `Bearer ${tokens.accessToken}`, ...clientHeaders(req) },
  }).catch(() => null)

  res.status(200).json({ user: me?.ok === true ? await me.json() : null })
}
