import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Пришёл ли этот POST со своей же страницы.
 *
 * Нужно потому, что все ручки под `/api/auth/*` управляют cookie сессии, а метода
 * запроса для этого мало. Форма с чужого сайта отправляет
 * `application/x-www-form-urlencoded` — это «простой» запрос, preflight его не
 * останавливает, и без проверки такой пост доходил до обработчика: `logout`
 * послушно снимал cookie (жертву выкидывало при каждом заходе на страницу
 * атакующего), а `telegram/widget` и `telegram/mini-app` **ставили** cookie чужого
 * аккаунта — подпись Telegram живёт сутки, так что один нажатый виджет позволял
 * весь день фиксировать браузеры жертв на аккаунте атакующего вместе с их
 * корзиной, вишлистом и оформленной заявкой. `SameSite=Lax` тут не помогает: он
 * ограничивает отправку cookie, а не установку.
 *
 * Проверяем два независимых признака, любого достаточно:
 *
 * - `Sec-Fetch-Site: same-origin` — ставит сам браузер, подделать со страницы
 *   нельзя; шлют все актуальные движки;
 * - `Origin`, совпадающий с хостом запроса — для клиентов постарше. Браузер
 *   присылает `Origin` на любой POST, включая свой же.
 *
 * Запрос вообще без обоих заголовков — не браузерная форма (curl, серверный
 * вызов), и CSRF там неоткуда взяться; он проходит.
 */
export const isSameOrigin = (req: NextApiRequest): boolean => {
  const site = header(req, 'sec-fetch-site')

  if (site !== undefined) {
    return site === 'same-origin'
  }

  const origin = header(req, 'origin')

  if (origin === undefined) {
    return true
  }

  const host = header(req, 'host')

  if (host === undefined) {
    return false
  }

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Отказывает кросс-сайтовому запросу и говорит, что ответ уже отправлен.
 *
 * Обёртка, а не голая проверка в каждом обработчике: забыть ответить здесь —
 * значит оставить ручку открытой, и одинаковая строка вызова это исключает.
 */
export const rejectCrossOrigin = (req: NextApiRequest, res: NextApiResponse): boolean => {
  if (isSameOrigin(req)) {
    return false
  }

  res.status(403).json({ detail: 'cross_origin_forbidden' })

  return true
}

const header = (req: NextApiRequest, name: string): string | undefined => {
  const raw = req.headers[name]

  return Array.isArray(raw) ? raw[0] : raw
}
