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
