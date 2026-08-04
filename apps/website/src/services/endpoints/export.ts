import { api, download, type IDownload } from '../api'

/**
 * Выгрузка заказов в xlsx. Ручка админская, поэтому качать её просто ссылкой
 * можно только через прокси — cookie `lb_at` браузер приложит сам.
 */

const PATH = '/admin/export/orders'

/** URL для `<a href … download>`: авторизация — на cookie, токен в адрес не попадает. */
export const ordersExportUrl = (cycleId?: string): string => api.url(PATH, { cycleId })

/**
 * Скачивание через fetch — нужно, когда ошибку (403/500) хочется показать в UI,
 * а не отдать браузеру пустой файл. Имя берётся из `Content-Disposition`
 * (бэк шлёт RFC 5987 — кириллица в имени файла переживает прокси).
 */
export const downloadOrdersExport = (cycleId?: string): Promise<IDownload> =>
  download(PATH, { cycleId })
