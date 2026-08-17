import type {
  IAdminOrder,
  IAdminUser,
  ICategory,
  IImportSummary,
  IOrderCycle,
  IPage,
  IProduct,
  IProductImage,
  OrderStatus,
  Role,
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

// --- Аккаунты и роли ---

export interface IAdminUserListParams {
  q?: string
  page?: number
  pageSize?: number
}

/**
 * Аккаунты магазина. Владельцы идут первыми — за этим список и открывают;
 * дальше по дате регистрации, новые сверху.
 */
export const listAdminUsers = (params: IAdminUserListParams = {}): Promise<IPage<IAdminUser>> =>
  api.get('/admin/users', {
    query: { q: params.q, page: params.page, pageSize: params.pageSize },
  })

/**
 * Выдать или снять доступ в админку. Владельцев может быть сколько угодно:
 * уведомления бота и так уходят каждому `ADMIN`, а сид заводит только первого.
 *
 * Свою роль изменить нельзя — бэкенд ответит `own_role_change`.
 */
export const updateUserRole = (userId: string, role: Role): Promise<IAdminUser> =>
  api.patch(`/admin/users/${encodeURIComponent(userId)}/role`, { body: { role } })

// --- Товары ---

export interface IAdminProductListParams {
  /** Slug категории — как и в публичном списке. */
  category?: string
  /** Название бренда целиком — как и в публичном списке (слага у бренда нет). */
  brand?: string
  inStock?: boolean
  q?: string
  /** Товары удаляются мягко; по умолчанию удалённые скрыты. */
  includeDeleted?: boolean
  page?: number
  pageSize?: number
}

/**
 * Бренды для админского фильтра.
 *
 * Отдельная от публичной ручка ради `includeDeleted`: с включённым показом
 * удалённых в списке должны быть и бренды, оставшиеся только на удалённых
 * товарах, иначе такую выборку нечем набрать.
 */
export const listAdminBrands = (includeDeleted = false): Promise<string[]> =>
  api.get('/admin/brands', { query: { includeDeleted } })

export interface IProductInput {
  name: string
  slug: string
  description?: string | null
  /** Обязателен: бэкенд не примет ни создание, ни изменение товара без бренда. */
  brand: string
  priceCents: number
  /** Объём в миллилитрах; `null` стирает его у товара, где он был. */
  volumeMl?: number | null
  categoryId?: string | null
  inStock?: boolean
}

export const listAdminProducts = (
  params: IAdminProductListParams = {}
): Promise<IPage<IProduct>> =>
  api.get('/admin/products', {
    query: {
      category: params.category,
      brand: params.brand,
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
}

/**
 * multipart/form-data: поля называются `file` и `alt`.
 *
 * Загрузка — это замена: у товара одна фотография, и бэкенд убирает прежнюю
 * (а у старых товаров — все прежние) в той же транзакции.
 */
export const uploadProductImage = (
  productId: string,
  input: IProductImageInput
): Promise<IProductImage> => {
  const body = new FormData()

  body.append('file', input.file)

  if (input.alt !== undefined) {
    body.append('alt', input.alt)
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

/**
 * Досрочное закрытие сбора. Делает ровно то же, что дедлайн: перестаёт принимать
 * заявки, переносит неоформленные корзины в избранное и шлёт владельцу итог, —
 * поэтому и живёт отдельной ручкой, а не `PATCH` со статусом.
 */
export const closeCycle = (cycleId: string): Promise<IOrderCycle> =>
  api.post(`/admin/cycles/${encodeURIComponent(cycleId)}/close`)

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
