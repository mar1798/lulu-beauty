import type { GetServerSideProps } from 'next'
import { listProducts } from '@/services/endpoints/catalog'
import { publicConfig } from '@/сonfig'

/**
 * Карта сайта.
 *
 * Отдаётся из `getServerSideProps`, а не лежит в `public`: каталог меняется
 * импортом xlsx и перед каждым сбором, и статический файл устаревал бы молча.
 * Компонент здесь формальность — ответ дописан в `res` и закрыт до того, как
 * Next дойдёт до рендера.
 *
 * В карте только те адреса, которые **существуют сейчас**: главная, каталог и
 * страница каждого товара. Категории и бренды живут в query-параметрах
 * (`/catalog?category=…`) — это не отдельные страницы, и в карту они попадут,
 * когда появятся настоящими маршрутами (фаза 3 плана).
 *
 * Товар, которого нет в текущем сборе, из карты **не исчезает**: его страница
 * жива и отвечает 200, а вычеркнуть адрес из карты — сказать поисковику, что
 * его больше нет (`SEO_PLAN.md`, задача 2.4). Уходят из неё только снятые
 * товары, которых нет и в самом каталоге.
 *
 * `<lastmod>` берётся из `updatedAt` товара — значения из базы, а не из даты
 * сборки: выдуманному `lastmod` Google перестаёт верить сразу по всей карте.
 * У главной и каталога его нет: их содержимое собирается из всего каталога
 * сразу, и честной даты правки у них попросту не существует. `<changefreq>` и
 * `<priority>` не пишутся вовсе — поисковик игнорирует их с 2023 года.
 */

/** Потолок публичной ручки (`page_size` ≤ 100) — больше за запрос не отдадут. */
const PAGE_SIZE = 100

/**
 * Предохранитель от бесконечного цикла: если `total` вдруг разойдётся с тем,
 * что реально приходит, обход остановится сам. 50 страниц — 5000 товаров,
 * на два порядка больше нынешнего каталога.
 */
const MAX_PAGES = 50

const SERVICE_UNAVAILABLE = 503

/** Час — столько же, сколько живёт ISR-кеш витрины; карту незачем собирать чаще. */
const CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'

/** Адрес в карте: путь и, если он известен, момент последней правки. */
interface ISitemapEntry {
  path: string
  lastModified?: string
}

/** Статические публичные адреса. Приватное (корзина, заявки, вход) закрыто в `robots.txt`. */
const STATIC_ENTRIES: readonly ISitemapEntry[] = [{ path: '/' }, { path: '/catalog' }]

/**
 * `updatedAt` в виде, который понимает формат карты сайта (W3C Datetime).
 * Значение приходит из API строкой; нечитаемую дату лучше не писать вовсе,
 * чем писать наугад.
 */
function lastModified(updatedAt: string): string | undefined {
  const parsed = new Date(updatedAt)

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

async function collectProductEntries(): Promise<ISitemapEntry[]> {
  const entries: ISitemapEntry[] = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // Последовательно, а не пачкой: сколько всего страниц, известно только из
    // первого ответа.
    const chunk = await listProducts({ page, pageSize: PAGE_SIZE })

    entries.push(
      ...chunk.items.map(product => ({
        path: `/catalog/${product.slug}`,
        lastModified: lastModified(product.updatedAt),
      }))
    )

    if (chunk.items.length === 0 || entries.length >= chunk.total) {
      break
    }
  }

  return entries
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/** Слаги совпадают с `^[a-z0-9-]+$`, но адрес сайта приходит из переменной окружения. */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, character => XML_ESCAPES[character] ?? character)
}

function buildSitemap(entries: readonly ISitemapEntry[]): string {
  const siteUrl = publicConfig('siteUrl')
  const urls = entries
    .map(entry => {
      const loc = `<loc>${escapeXml(`${siteUrl}${entry.path}`)}</loc>`
      const lastmod =
        entry.lastModified === undefined ? '' : `<lastmod>${escapeXml(entry.lastModified)}</lastmod>`

      return `  <url>${loc}${lastmod}</url>`
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n')
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  let productEntries: ISitemapEntry[]

  try {
    productEntries = await collectProductEntries()
  } catch {
    // Половина карты хуже её отсутствия: поисковик принял бы недостающие
    // адреса за снятые. 503 он перечитает, усечённый список — запомнит.
    res.statusCode = SERVICE_UNAVAILABLE
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Retry-After', '3600')
    res.end('catalog unavailable')

    return { props: {} }
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', CACHE_CONTROL)
  res.end(buildSitemap([...STATIC_ENTRIES, ...productEntries]))

  return { props: {} }
}

/** Ответ уже закрыт в `getServerSideProps` — рендерить нечего. */
const SitemapPage = (): null => null

export default SitemapPage
