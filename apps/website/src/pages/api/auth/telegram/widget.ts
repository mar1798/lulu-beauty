import type { NextApiRequest, NextApiResponse } from 'next'
import { methodNotAllowed } from '@/server/apiFetch'
import { signInThroughTelegram } from '@/server/telegramSignIn'
import { rejectCrossOrigin } from '@/server/sameOrigin'

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

  const payload = req.body as Record<string, unknown> | undefined

  if (payload == null || typeof payload !== 'object' || typeof payload.hash !== 'string') {
    res.status(400).json({ detail: 'telegram_auth_invalid' })
    return
  }

  await signInThroughTelegram(req, res, '/auth/telegram/widget', payload)
}

export default handler
