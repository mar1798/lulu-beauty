import type { OrderStatus } from 'widgets/types'
import { api, download, type IDownload } from '../api'

/**
 * Выгрузка заказов в xlsx. Ручка админская, поэтому качать её просто ссылкой
 * можно только через прокси — cookie `lb_at` браузер приложит сам.
 *
 * Фильтры те же, что у списка заявок: сбор и статус. Лист — сводный (одна
 * строка на товар), поэтому статус важен: с «любым» в закупку попадут и
 * отменённые заявки.
 */

const PATH = '/admin/export/orders'

export interface IOrdersExportFilters {
  cycleId?: string
  status?: OrderStatus
  /**
   * Нужны ли в листе колонки «Цена за штуку» и «Сумма». Лист часто уходит
   * поставщику, а ему знать наши цены незачем. Пропущенный параметр бэк
   * понимает как «с ценами» — умолчание для закупки самого владельца.
   */
  includePrices?: boolean
}

/** URL для `<a href … download>`: авторизация — на cookie, токен в адрес не попадает. */
export const ordersExportUrl = (filters: IOrdersExportFilters = {}): string =>
  api.url(PATH, { ...filters })

/**
 * Скачивание через fetch — нужно, когда ошибку (403/500) хочется показать в UI,
 * а не отдать браузеру пустой файл. Имя берётся из `Content-Disposition`
 * (бэк шлёт RFC 5987 — кириллица в имени файла переживает прокси).
 */
export const downloadOrdersExport = (filters: IOrdersExportFilters = {}): Promise<IDownload> =>
  download(PATH, { ...filters })

const CATALOG_PATH = '/admin/export/products'

/**
 * Выгрузка каталога в xlsx. Колонки — те же, что читает импорт (`name`, `slug`,
 * `price`, …), поэтому файл возвращается обратно через ту же страницу без
 * правки заголовков. `description` и фотографии в лист не попадают намеренно:
 * импорт считает отсутствующую колонку за «не трогать», так что и описания, и
 * снимки переживают круг целыми.
 */
export const downloadCatalogExport = (): Promise<IDownload> => download(CATALOG_PATH)

export interface IExportLinkRequest extends IOrdersExportFilters {
  kind: 'orders' | 'products'
}

/**
 * Адрес выгрузки, который открывается без cookie: подписанный токен на две
 * минуты прямо в пути (`POST /admin/export/links`).
 *
 * Нужен там, где `saveBlob` не работает, — в браузере и Mini App Telegram (см.
 * `utils/exportDownload.ts`): файл по нему скачивает сам Telegram или внешний
 * браузер, а наших cookie у них нет. Адрес абсолютный — Telegram относительный
 * не примет.
 */
export const createExportLink = async (request: IExportLinkRequest): Promise<string> => {
  const { token } = await api.post<{ token: string }>('/admin/export/links', { body: request })

  return new URL(api.url(`/export/download/${encodeURIComponent(token)}`), window.location.origin)
    .href
}
