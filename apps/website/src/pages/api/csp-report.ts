import type { NextApiRequest, NextApiResponse } from 'next'
import { methodNotAllowed } from '@/server/apiFetch'

/**
 * Приёмник отчётов о нарушениях CSP — адрес, указанный в `report-uri`/`report-to`
 * политики из `next.config.js`.
 *
 * Без него полная политика висела в `Report-Only` вхолостую: браузер честно
 * находил нарушения, но отправлять их было некуда, и увидеть их мог только тот,
 * у кого открыта консоль на нужной странице. Теперь они попадают в
 * `docker compose logs website` строкой `csp-violation`, и по ним видно, что
 * именно придётся разрешить перед переводом политики в принудительный режим.
 *
 * Отчёт приходит в одном из двух форматов, и поддерживать нужно оба: старый
 * `report-uri` (тело `{"csp-report": {...}}`, `application/csp-report`) понимают
 * все браузеры, новый Reporting API (массив отчётов, `application/reports+json`)
 * шлёт Chrome, и именно он останется, когда `report-uri` выпилят.
 *
 * Ручка публичная и неаутентифицированная — иначе она не работала бы вовсе:
 * отчёт браузер отправляет сам, без cookie. Поэтому прислать в неё что угодно
 * может кто угодно, и защита от захламления лога здесь не «на всякий случай»:
 * тело ограничено по размеру, а каждое различимое нарушение пишется один раз.
 */

// Тело разбираем сами: `application/csp-report` — не тот content-type, который
// разбирает Next, а читать поток всё равно нужно с ограничением по размеру.
export const config = { api: { bodyParser: false } }

/** Настоящий отчёт — это единицы килобайт. Всё, что больше, читать незачем. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Сколько разных нарушений помним, чтобы не писать одно и то же в лог.
 *
 * Множество живёт в памяти процесса и обнуляется при каждой пересборке — это
 * и нужно: после правки политики нарушения должны показаться заново.
 */
const SEEN_LIMIT = 200

const seen = new Set<string>()

/**
 * Чужие расширения браузера. Их скрипты и стили нарушают политику на любом
 * сайте, к нашему коду это отношения не имеет, а в логе они дают больше шума,
 * чем все настоящие нарушения вместе взятые.
 */
const FOREIGN_SCHEMES = [
  'chrome-extension:',
  'moz-extension:',
  'safari-extension:',
  'safari-web-extension:',
]

interface IViolation {
  /** `enforce` — нарушена принудительная часть политики, `report` — та, что пока только отчётом. */
  disposition: string
  directive: string
  blockedUri: string
  documentUri: string
  /** Файл и строка, если браузер их сообщил, — иначе пусто. */
  source: string
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const sourceOf = (file: unknown, line: unknown): string => {
  const path = text(file)

  if (path === undefined) {
    return ''
  }

  return typeof line === 'number' ? `${path}:${line}` : path
}

/** Старый формат: `{"csp-report": {"violated-directive": …, "blocked-uri": …}}`. */
const fromReportUri = (payload: Record<string, unknown>): IViolation | undefined => {
  const report = payload['csp-report']

  if (typeof report !== 'object' || report === null) {
    return undefined
  }

  const fields = report as Record<string, unknown>
  const directive = text(fields['effective-directive']) ?? text(fields['violated-directive'])

  if (directive === undefined) {
    return undefined
  }

  return {
    disposition: text(fields['disposition']) ?? 'report',
    directive,
    blockedUri: text(fields['blocked-uri']) ?? 'unknown',
    documentUri: text(fields['document-uri']) ?? 'unknown',
    source: sourceOf(fields['source-file'], fields['line-number']),
  }
}

/** Reporting API: массив отчётов разных типов, нас интересует `csp-violation`. */
const fromReportingApi = (entry: unknown): IViolation | undefined => {
  if (typeof entry !== 'object' || entry === null) {
    return undefined
  }

  const report = entry as Record<string, unknown>
  const body = report['body']

  if (report['type'] !== 'csp-violation' || typeof body !== 'object' || body === null) {
    return undefined
  }

  const fields = body as Record<string, unknown>
  const directive = text(fields['effectiveDirective'])

  if (directive === undefined) {
    return undefined
  }

  return {
    disposition: text(fields['disposition']) ?? 'report',
    directive,
    blockedUri: text(fields['blockedURL']) ?? 'unknown',
    documentUri: text(fields['documentURL']) ?? text(report['url']) ?? 'unknown',
    source: sourceOf(fields['sourceFile'], fields['lineNumber']),
  }
}

const parseViolations = (raw: string): IViolation[] => {
  let payload: unknown

  try {
    payload = JSON.parse(raw)
  } catch {
    return []
  }

  if (Array.isArray(payload)) {
    return payload.map(fromReportingApi).filter((item): item is IViolation => item !== undefined)
  }

  if (typeof payload !== 'object' || payload === null) {
    return []
  }

  const violation = fromReportUri(payload as Record<string, unknown>)

  return violation === undefined ? [] : [violation]
}

const isForeign = (violation: IViolation): boolean =>
  FOREIGN_SCHEMES.some(scheme => violation.blockedUri.startsWith(scheme))

/**
 * Одинаковые нарушения повторяются на каждой загрузке страницы у каждого
 * посетителя, поэтому в лог идёт только первое. Заполнив лимит, множество
 * очищается целиком: это дешевле любого вытеснения по возрасту, а худшее, что
 * может случиться, — нарушение напечатается второй раз.
 */
const isNew = (signature: string): boolean => {
  if (seen.has(signature)) {
    return false
  }

  if (seen.size >= SEEN_LIMIT) {
    seen.clear()
  }

  seen.add(signature)

  return true
}

const readBody = async (req: NextApiRequest): Promise<string | undefined> => {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = chunk as Buffer

    size += buffer.length

    if (size > MAX_BODY_BYTES) {
      return undefined
    }

    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const raw = await readBody(req)

  // Ответ одинаков в любом случае: браузеру от него ничего не нужно, а
  // рассказывать отправителю, разобрали мы тело или нет, незачем. Отвечаем
  // до разбора, но после чтения тела: недочитанный запрос Node обрывает сам.
  res.status(204).end()

  if (raw === undefined) {
    return
  }

  for (const violation of parseViolations(raw)) {
    if (isForeign(violation)) {
      continue
    }

    const signature = `${violation.directive} ${violation.blockedUri} ${violation.source}`

    if (!isNew(signature)) {
      continue
    }

    const at = violation.source === '' ? '' : ` at=${violation.source}`

    // Намеренный лог в stdout: его собирает docker, и это единственный способ
    // увидеть отчёты, не поднимая ради них отдельный сервис.
    console.warn(
      `csp-violation ${violation.disposition} ${violation.directive} ` +
        `blocked=${violation.blockedUri} page=${violation.documentUri}${at}`
    )
  }
}

export default handler
