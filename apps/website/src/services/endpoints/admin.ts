import type {
  IAdminOrder,
  ICategory,
  IImportSummary,
  IOrderCycle,
  IPage,
  IProduct,
  IProductImage,
  OrderStatus,
} from 'widgets/types'
import { api } from '../api'

/**
 * Админские ручки (`require_admin` на бэке). Все идут через прокси — токен
 * подставляется из cookie на сервере Next.
 *
 * Внимание на параметры запроса: в отличие от публичного `/products`,
 * админский список объявлен с camelCase-алиасами (`inStock`, `includeDeleted`,
 * `pageSize`), а `category` так и остался фильтром по slug.
 */

// --- Категории ---

export interface ICategoryInput {
  name: string
  slug: string
  sortOrder?: number
}

export const createCategory = (input: ICategoryInput): Promise<ICategory> =>
  api.post('/admin/categories', { body: input })

export const updateCategory = (
  categoryId: string,
  input: Partial<ICategoryInput>
): Promise<ICategory> =>
  api.patch(`/admin/categories/${encodeURIComponent(categoryId)}`, { body: input })

export const deleteCategory = (categoryId: string): Promise<void> =>
  api.remove(`/admin/categories/${encodeURIComponent(categoryId)}`)

// --- Товары ---

export interface IAdminProductListParams {
  /** Slug категории — как и в публичном списке. */
  category?: string
  inStock?: boolean
  q?: string
  /** Товары удаляются мягко; по умолчанию удалённые скрыты. */
  includeDeleted?: boolean
  page?: number
  pageSize?: number
}

export interface IProductInput {
  name: string
  slug: string
  description?: string | null
  brand?: string | null
  priceCents: number
  categoryId?: string | null
  inStock?: boolean
}

export const listAdminProducts = (
  params: IAdminProductListParams = {}
): Promise<IPage<IProduct>> =>
  api.get('/admin/products', {
    query: {
      category: params.category,
      inStock: params.inStock,
      q: params.q,
      includeDeleted: params.includeDeleted,
      page: params.page,
      pageSize: params.pageSize,
    },
  })

/** В админке товар открывается по id, а не по slug (slug редактируемый). */
export const getAdminProduct = (productId: string): Promise<IProduct> =>
  api.get(`/admin/products/${encodeURIComponent(productId)}`)

export const createProduct = (input: IProductInput): Promise<IProduct> =>
  api.post('/admin/products', { body: input })

export const updateProduct = (
  productId: string,
  input: Partial<IProductInput>
): Promise<IProduct> => api.patch(`/admin/products/${encodeURIComponent(productId)}`, { body: input })

export const deleteProduct = (productId: string): Promise<void> =>
  api.remove(`/admin/products/${encodeURIComponent(productId)}`)

export const restoreProduct = (productId: string): Promise<IProduct> =>
  api.post(`/admin/products/${encodeURIComponent(productId)}/restore`)

export interface IProductImageInput {
  file: File
  alt?: string
  isPrimary?: boolean
}

/** multipart/form-data: поля называются `file`, `alt`, `isPrimary` (последнее — с алиасом). */
export const uploadProductImage = (
  productId: string,
  input: IProductImageInput
): Promise<IProductImage> => {
  const body = new FormData()

  body.append('file', input.file)

  if (input.alt !== undefined) {
    body.append('alt', input.alt)
  }

  if (input.isPrimary !== undefined) {
    body.append('isPrimary', String(input.isPrimary))
  }

  return api.post(`/admin/products/${encodeURIComponent(productId)}/images`, { body })
}

export const deleteProductImage = (productId: string, imageId: string): Promise<void> =>
  api.remove(
    `/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`
  )

/** Импорт каталога из csv/xlsx. Ошибки строк приходят внутри ответа, а не как HTTP-ошибка. */
export const importCatalog = (file: File): Promise<IImportSummary> => {
  const body = new FormData()

  body.append('file', file)

  return api.post('/admin/catalog/import', { body })
}

// --- Сборы заказов ---

export interface ICycleInput {
  /** ISO-строка с таймзоной; бэк считает дедлайн в `CYCLE_TIMEZONE` (Asia/Bishkek). */
  deadlineAt: string
  label?: string | null
}

export const listCycles = (): Promise<IOrderCycle[]> => api.get('/admin/cycles')

export const createCycle = (input: ICycleInput): Promise<IOrderCycle> =>
  api.post('/admin/cycles', { body: input })

export const updateCycle = (
  cycleId: string,
  input: Partial<ICycleInput>
): Promise<IOrderCycle> => api.patch(`/admin/cycles/${encodeURIComponent(cycleId)}`, { body: input })

export const deleteCycle = (cycleId: string): Promise<void> =>
  api.remove(`/admin/cycles/${encodeURIComponent(cycleId)}`)

// --- Заказы ---

export interface IAdminOrderListParams {
  cycleId?: string
  status?: OrderStatus
  page?: number
  pageSize?: number
}

export const listAdminOrders = (
  params: IAdminOrderListParams = {}
): Promise<IPage<IAdminOrder>> =>
  api.get('/admin/orders', {
    query: {
      cycleId: params.cycleId,
      status: params.status,
      page: params.page,
      pageSize: params.pageSize,
    },
  })

export const updateOrderStatus = (
  orderId: string,
  status: OrderStatus
): Promise<IAdminOrder> =>
  api.patch(`/admin/orders/${encodeURIComponent(orderId)}/status`, { body: { status } })

/**
 * Удаление заявки владельцем — настоящее, в отличие от покупательской отмены
 * (`POST /orders/{id}/cancel`): заявка уходит из базы вместе с позициями и
 * пропадает из выгрузок за прошлые сборы.
 */
export const deleteOrder = (orderId: string): Promise<void> =>
  api.remove(`/admin/orders/${encodeURIComponent(orderId)}`)
