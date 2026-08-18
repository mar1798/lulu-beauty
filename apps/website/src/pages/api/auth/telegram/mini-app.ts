import type { NextApiRequest, NextApiResponse } from 'next'
import { methodNotAllowed } from '@/server/apiFetch'
import { signInThroughTelegram } from '@/server/telegramSignIn'

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

  const initData = (req.body as { initData?: unknown } | undefined)?.initData

  if (typeof initData !== 'string' || initData === '') {
    res.status(400).json({ detail: 'telegram_auth_invalid' })
    return
  }

  await signInThroughTelegram(req, res, '/auth/telegram/mini-app', { initData })
}

export default handler
