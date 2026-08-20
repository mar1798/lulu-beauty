import type { NextApiRequest, NextApiResponse } from 'next'
import { methodNotAllowed } from '@/server/apiFetch'
import { signInThroughTelegram } from '@/server/telegramSignIn'
import { rejectCrossOrigin } from '@/server/sameOrigin'

/**
 * Вход изнутри Telegram: сайт открыт как Mini App, и `initData` — доказательство.
 *
 * Строка пересылается дословно. Подпись считается по той самой строке, которую собрал
 * Telegram, так что любой разбор-и-сборка по дороге рано или поздно переэкранирует один
 * символ и превратит все входы в «подпись не сходится».
 */

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  // Ручка меняет cookie сессии — значит, она мишень для CSRF (см. sameOrigin.ts).
  if (rejectCrossOrigin(req, res)) {
    return
  }

  // Второй рубеж к тому же: форму нельзя отправить как JSON, а своя страница
  // ничего другого сюда и не шлёт — так что «простой» кросс-сайтовый пост
  // отсекается ещё и по типу тела.
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
    res.status(415).json({ detail: 'unsupported_media_type' })
    return
  }

  const initData = (req.body as { initData?: unknown } | undefined)?.initData

  if (typeof initData !== 'string' || initData === '') {
    res.status(400).json({ detail: 'telegram_auth_invalid' })
    return
  }

  await signInThroughTelegram(req, res, '/auth/telegram/mini-app', { initData })
}

export default handler
