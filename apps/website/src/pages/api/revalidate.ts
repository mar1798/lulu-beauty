import type { NextApiRequest, NextApiResponse } from 'next'
import type { Role } from 'widgets/types'
import {
  NO_STORE,
  UnauthenticatedError,
  UpstreamUnavailableError,
  fetchWithAuth,
  methodNotAllowed,
  unauthenticated,
} from '@/server/apiFetch'
import { resetSharedStaticData } from '@/services/staticData'
import { rejectCrossOrigin } from '@/server/sameOrigin'

/**
 * Ревалидация публичных страниц по требованию.
 *
 * Каталог, карточка товара и главная — статика с ISR (`revalidate: 60`), и до
 * появления этой ручки правка в админке доезжала до покупателя сама: минуту на
 * протухание плюс ещё один заход, потому что первый запрос после протухания
 * отдаёт старую страницу и только запускает пересборку. Владелец, открывший
 * каталог сразу после сохранения, видел прежнюю цену и решал, что не сохранилось.
 *
 * Теперь админка дёргает эту ручку после каждой правки каталога, и `res.revalidate`
 * пересобирает названные страницы немедленно. `revalidate: 60` остаётся страховкой:
 * ручку может не дозваться вкладка, потерявшая связь, а импорт меняет разом больше
 * страниц, чем имеет смысл перечислять.
 *
 * Доступ — по той же роли, что и сами правки: ручка живёт на домене сайта и
 * досягаема кем угодно, а пересборка страницы стоит запроса к API. Проверяем
 * ролью из `/users/me`, а не наличием cookie: покупатель тоже залогинен.
 */

/**
 * Сколько адресов принимаем за раз.
 *
 * Больше четырёх не называет никто: витрина — это два адреса, правка товара
 * добавляет к ним его страницу и, если переписали slug, прежнюю. Запас вдвое —
 * на случай, что у витрины появится третья страница.
 */
const MAX_PATHS = 8

const FORBIDDEN = 403
const BAD_REQUEST = 400
const UPSTREAM_UNAVAILABLE = 503

/**
 * Что вообще разрешено пересобирать: только публичная статика.
 *
 * Список закрытый не из вредности — `res.revalidate` заставляет сервер сходить
 * за данными и отрисовать страницу, и превращать это в «назови любой адрес»
 * незачем. Всё, что пересобирается, перечислено в `services/endpoints/revalidate.ts`.
 *
 * Slug повторяет `SLUG_PATTERN` бэкенда (`apps/api/app/catalog/schemas.py`):
 * раз список закрытый, ему незачем пропускать адреса, которых у товара
 * не бывает.
 */
const PRODUCT_PATH = /^\/catalog\/[a-z0-9]+(?:-[a-z0-9]+)*$/
const STATIC_PATHS = new Set(['/', '/catalog'])

const isPublicPath = (path: string): boolean => STATIC_PATHS.has(path) || PRODUCT_PATH.test(path)

/** Адреса из тела запроса — или `null`, если пришло не то. */
const readPaths = (body: unknown): string[] | null => {
  if (typeof body !== 'object' || body === null) {
    return null
  }

  const { paths } = body as { paths?: unknown }

  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS) {
    return null
  }

  if (!paths.every((path): path is string => typeof path === 'string' && isPublicPath(path))) {
    return null
  }

  // Дубликаты ни к чему: правка товара и его же каталог часто приходят вместе.
  return [...new Set(paths)]
}

const ADMIN_ROLES: ReadonlySet<Role> = new Set<Role>(['ADMIN', 'SUPER_ADMIN'])

/** Пересборка одного адреса: `true` — получилось. */
const revalidateOnce = async (res: NextApiResponse, path: string): Promise<boolean> => {
  try {
    await res.revalidate(path)

    return true
  } catch {
    /*
      Отказ по одному адресу не отменяет остальные. Сюда попадает только
      настоящая осечка — недоступный API, упавший рендер: страница, которой
      ещё нет в кеше, не отказ, а обычная генерация (`fallback: true`), а
      удалённый товар отдаёт свои 404 как успешную пересборку.
    */
    return false
  }
}

/** Пересборки, идущие прямо сейчас, — по одной на адрес. */
interface IRun {
  running: Promise<boolean>
  /** Правку прислали, когда рендер уже шёл: его результат её не застал. */
  isDirty: boolean
}

/*
  Состояние модульное, а не на `globalThis`: копия этого модуля у ручки одна,
  и больше в неё никто не заглядывает (в отличие от `staticData`, который
  читают и страницы тоже).
*/
const running = new Map<string, IRun>()

/**
 * Пересобрать адрес, не запуская второй рендер поверх идущего.
 *
 * Владелец правит товары подряд, и каждая правка называет обе страницы витрины:
 * без склейки десять сохранений — это двадцать полных рендеров `/` и `/catalog`,
 * из которых полезны два последних.
 *
 * Склейка именно по «идёт прямо сейчас», а не по «пересобрали N секунд назад»:
 * пропустить адрес по времени значило бы потерять ту самую правку, ради
 * доставки которой ручку и зовут. Поэтому запрос, пришедший во время рендера,
 * не отбрасывается, а помечает его устаревшим — и по завершении рендер
 * повторяется, сколько бы правок ни накопилось, ровно один раз на всех.
 *
 * Повтор берёт `res` того запроса, который рендер начал, хотя тот, возможно,
 * уже ответил. Это безопасно: `res.revalidate` пишет не в него, а замыкает
 * заголовки запроса и контекст ручки (см. `api-utils/node/api-resolver.js`).
 */
const revalidatePath = (res: NextApiResponse, path: string): Promise<boolean> => {
  const current = running.get(path)

  if (current !== undefined) {
    current.isDirty = true

    return current.running
  }

  const run: IRun = { isDirty: false, running: Promise.resolve(false) }

  run.running = (async () => {
    try {
      let ok = await revalidateOnce(res, path)

      while (run.isDirty) {
        run.isDirty = false
        ok = await revalidateOnce(res, path)
      }

      return ok
    } finally {
      running.delete(path)
    }
  })()

  running.set(path, run)

  return run.running
}

const isAdmin = async (req: NextApiRequest, res: NextApiResponse): Promise<boolean> => {
  const response = await fetchWithAuth(
    req,
    res,
    '/users/me',
    '',
    { method: 'GET' },
    { auth: 'required' }
  )

  if (!response.ok) {
    return false
  }

  const user = (await response.json()) as { role?: Role }

  return user.role !== undefined && ADMIN_ROLES.has(user.role)
}

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  // Только со своей страницы: во фрейме Telegram Web cookie админа стоят с
  // `SameSite=None`, и от CSRF защищает уже проверка происхождения.
  if (rejectCrossOrigin(req, res)) {
    return
  }

  res.setHeader('Cache-Control', NO_STORE)

  const paths = readPaths(req.body)

  if (paths === null) {
    res.status(BAD_REQUEST).json({ detail: 'validation_error' })
    return
  }

  try {
    if (!(await isAdmin(req, res))) {
      res.status(FORBIDDEN).json({ detail: 'admin_only' })
      return
    }
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      unauthenticated(res)
      return
    }

    if (error instanceof UpstreamUnavailableError) {
      res.status(UPSTREAM_UNAVAILABLE).json({ detail: 'upstream_unavailable' })
      return
    }

    throw error
  }

  // Пересборка возьмёт категории и сбор из общего кеша `staticData` — а он
  // живёт минуту, ровно то запаздывание, ради снятия которого всё и затеяно.
  resetSharedStaticData()

  /*
    Параллельно, а не по очереди: рендер `/catalog` — это три запроса к API и
    два десятка карточек, и выстроенные цепочкой три-четыре таких рендера
    складывались в секунды, которые админка ждала впустую. Порядок здесь не
    значит ничего — общий кеш уже сброшен выше.
  */
  const results = await Promise.all(
    paths.map(async path => ({ path, isOk: await revalidatePath(res, path) }))
  )

  res.status(200).json({
    revalidated: results.filter(result => result.isOk).map(result => result.path),
    failed: results.filter(result => !result.isOk).map(result => result.path),
  })
}

export default handler
