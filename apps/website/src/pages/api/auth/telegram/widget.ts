import type { NextApiRequest, NextApiResponse } from 'next'
import { methodNotAllowed } from '@/server/apiFetch'
import { signInThroughTelegram } from '@/server/telegramSignIn'

/**
 * Вход через Telegram Login Widget: объект, который виджет отдал странице, идёт на бэкенд
 * целиком и без изменений — подписью накрыты все его поля, включая те, что нам не нужны.
 *
 * Ничего не проверяем здесь: подпись считается по токену бота, а его на стороне Next нет
 * и быть не должно.
 */

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const payload = req.body as Record<string, unknown> | undefined

  if (payload == null || typeof payload !== 'object' || typeof payload.hash !== 'string') {
    res.status(400).json({ detail: 'telegram_auth_invalid' })
    return
  }

  await signInThroughTelegram(res, '/auth/telegram/widget', payload)
}

export default handler
