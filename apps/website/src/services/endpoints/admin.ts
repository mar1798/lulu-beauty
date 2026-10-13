import type {
  IAdminChecklist,
  IAdminOrder,
  IAdminOrderCycle,
  IAdminOrderPage,
  IAdminProductSort,
  IAdminProductSortField,
  IAdminUser,
  ICategory,
  IImportSummary,
  IOrderCycle,
  IPage,
  IProduct,
  IProductImage,
  OrderStatus,
  ISortDirection,
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
  /** Раздел подкатегории. `null` в правке возвращает её на верхний уровень. */
  parentId?: string | null
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
 * Выдать или снять доступ в админку. Админов может быть сколько угодно:
 * уведомления бота уходят каждому из них.
 *
 * Ручка только для `SUPER_ADMIN` — остальным `super_admin_only`. Саму роль super
 * admin ни выдать (`super_admin_not_assignable`), ни снять (`super_admin_immutable`)
 * нельзя: её ставит сид при настройке магазина.
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
  /** Только отмеченные для главной — найти, с какого снять отметку, когда их уже три. */
  featured?: boolean
  page?: number
  pageSize?: number
  /** Без него бэкенд сортирует новыми вперёд — как витрина (`ADMIN_PRODUCT_SORT_DEFAULT`). */
  sort?: IAdminProductSort
}

export const ADMIN_PRODUCT_SORT_FIELDS: readonly IAdminProductSortField[] = [
  'name',
  'price',
  'created',
]

export const SORT_DIRECTIONS: readonly ISortDirection[] = ['asc', 'desc']

export const ADMIN_PRODUCT_SORT_DEFAULT: IAdminProductSort = {
  field: 'created',
  direction: 'desc',
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

/** Один объём товара в запросе: список заменяет объёмы целиком. */
export interface IProductVariantInput {
  /** Миллилитры; `null` — товару нечего измерять (патчи, тканевые маски). */
  volumeMl: number | null
  priceCents: number
  inStock: boolean
}

export interface IProductInput {
  name: string
  slug: string
  /**
   * HTML из редактора описания; `null` — описания нет. Простой текст
   * (`IProduct.description`) бэкенд выводит из него сам, поэтому отдельно он
   * не отправляется.
   */
  descriptionHtml?: string | null
  /** Обязателен: бэкенд не примет ни создание, ни изменение товара без бренда. */
  brand: string
  /**
   * Объёмы товара. Присланный список заменяет прежний целиком: форма
   * показывает все объёмы сразу, и список, который умеет только расти, не
   * дал бы снять ни один. Сверяет их бэкенд по объёму, а не по порядку, —
   * поэтому правка цены не трогает строку, на которую ссылаются чужие
   * корзины (`ProductService._apply_specs`).
   */
  variants?: IProductVariantInput[]
  /**
   * Витринные поля товара. Бэкенд всё равно пересчитает их по `variants`;
   * `priceCents` тут потому, что схема создания товара его требует, а
   * `volumeMl`/`inStock` — чтобы запрос описывал одно и то же состояние
   * целиком, а не наполовину.
   *
   * Без `variants` они означают единственный объём товара — так ходит
   * импорт и так по-прежнему можно поправить цену обычного товара.
   */
  priceCents: number
  volumeMl?: number | null
  categoryId?: string | null
  inStock?: boolean
  /**
   * Карточка в герое главной. Сверх `MAX_FEATURED_PRODUCTS` бэкенд отвечает
   * 409 `featured_limit_reached` — какую отметку снять, решает владелец.
   */
  isFeatured?: boolean
}

export const listAdminProducts = (params: IAdminProductListParams = {}): Promise<IPage<IProduct>> =>
  api.get('/admin/products', {
    query: {
      category: params.category,
      brand: params.brand,
      inStock: params.inStock,
      q: params.q,
      includeDeleted: params.includeDeleted,
      featured: params.featured,
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort?.field,
      order: params.sort?.direction,
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
): Promise<IProduct> =>
  api.patch(`/admin/products/${encodeURIComponent(productId)}`, { body: input })

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

export const updateCycle = (cycleId: string, input: Partial<ICycleInput>): Promise<IOrderCycle> =>
  api.patch(`/admin/cycles/${encodeURIComponent(cycleId)}`, { body: input })

/**
 * Досрочное закрытие сбора. Делает ровно то же, что дедлайн: перестаёт принимать
 * заявки, переносит неоформленные корзины в избранное и шлёт владельцу итог, —
 * поэтому и живёт отдельной ручкой, а не `PATCH` со статусом.
 */
export const closeCycle = (cycleId: string): Promise<IOrderCycle> =>
  api.post(`/admin/cycles/${encodeURIComponent(cycleId)}/close`)

/** Что заберёт с собой удаление сбора — из этого строится подтверждение. */
export interface ICycleDeletion {
  /** Все заявки сбора: столько удалится вместе с ним. */
  orders: number
  /** Заявки в работе, с оплатой или с чеком: пока они есть, бэкенд сбор не удалит. */
  blockingOrders: number
}

export const getCycleDeletion = (cycleId: string): Promise<ICycleDeletion> =>
  api.get(`/admin/cycles/${encodeURIComponent(cycleId)}/deletion`)

/**
 * Удаляет закрытый сбор вместе с оставшимися в нём заявками. `expectedOrders` —
 * число из подтверждения: если на бэкенде их окажется другое число, он ответит
 * `cycle_orders_changed` и ничего не удалит.
 */
export const deleteCycle = (cycleId: string, expectedOrders: number): Promise<void> =>
  api.remove(`/admin/cycles/${encodeURIComponent(cycleId)}`, { query: { expectedOrders } })

// --- Заказы ---

export interface IAdminOrderListParams {
  cycleId?: string
  status?: OrderStatus
  page?: number
  pageSize?: number
}

export const listAdminOrders = (params: IAdminOrderListParams = {}): Promise<IAdminOrderPage> =>
  api.get('/admin/orders', {
    query: {
      cycleId: params.cycleId,
      status: params.status,
      page: params.page,
      pageSize: params.pageSize,
    },
  })

/**
 * Сборы, в которые админ может положить заявку за покупателя: открытый и
 * закрытые не больше трёх дней назад, сбор по умолчанию — первым. С `userId`
 * у каждого сбора приходят открытые заявки этого покупателя в нём.
 */
export const listAdminOrderCycles = (userId?: string): Promise<IAdminOrderCycle[]> =>
  api.get('/admin/orders/cycles', { query: { userId } })

export interface IAdminOrderInput {
  /**
   * Один на черновик: повтор с тем же ключом (двойной клик, ответ потерялся)
   * возвращает уже созданную заявку, а не вторую.
   */
  requestId: string
  userId: string
  /** Без него бэкенд берёт сбор по умолчанию — первый из `listAdminOrderCycles`. */
  cycleId?: string
  items: { variantId: string; quantity: number }[]
  note?: string
}

/**
 * Заявка за покупателя из админки. Уходит «Ожидает подтверждения», по текущим
 * ценам каталога; бот сообщает о ней и покупателю, и всем админам. Снятый с
 * продажи или кончившийся товар отклоняет заявку целиком (`product_not_found`).
 */
export const createAdminOrder = (input: IAdminOrderInput): Promise<IAdminOrder> =>
  api.post('/admin/orders', { body: input })

export const updateOrderStatus = (orderId: string, status: OrderStatus): Promise<IAdminOrder> =>
  api.patch(`/admin/orders/${encodeURIComponent(orderId)}/status`, { body: { status } })

/**
 * Предел длины сообщения покупателю — `MAX_OWNER_MESSAGE_LENGTH` на бэке.
 * Ниже телеграмных 4096: бот добавляет к тексту шапку с номером заявки и строку
 * про Instagram, и всё это должно уйти одним сообщением.
 */
export const OWNER_MESSAGE_MAX_LENGTH = 3500

/**
 * Сообщение покупателю через бота — для того, кого по номеру в Telegram не
 * найти. Отправка синхронная: успех значит, что Telegram сообщение принял.
 */
export const messageCustomer = (orderId: string, text: string): Promise<void> =>
  api.post(`/admin/orders/${encodeURIComponent(orderId)}/message`, { body: { text } })

/**
 * Удаление заявки владельцем — настоящее, в отличие от покупательской отмены
 * (`POST /orders/{id}/cancel`): заявка уходит из базы вместе с позициями и
 * пропадает из выгрузок за прошлые сборы.
 */
export const deleteOrder = (orderId: string): Promise<void> =>
  api.remove(`/admin/orders/${encodeURIComponent(orderId)}`)

// --- Чек-лист закупки ---

/**
 * Что купить по открытому сбору, а если открытого нет — по последнему
 * закрытому: сбор выбирает бэкенд. Строки те же, что в xlsx-выгрузке с
 * ценами, без отменённых заявок.
 */
export const getAdminChecklist = (): Promise<IAdminChecklist> => api.get('/admin/checklist')
