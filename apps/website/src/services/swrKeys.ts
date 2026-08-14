/**
 * Ключи `useSWR` в одном месте.
 *
 * Все — кортежи, помеченные строкой-тегом первым элементом (как `ICatalogKey`
 * в `catalog/index.tsx`). Общий ключ — единственное, что даёт двум разным
 * страницам общий кеш: если бы каждая писала строку вручную, `'admin-categories'`
 * на одной странице и `'admin-categories'` на другой совпали бы случайно (и уже
 * совпадали), а любая опечатка молча завела бы отдельный кеш. Тег ещё и
 * позволяет инвалидировать все варианты фильтров/страниц разом —
 * `mutate(key => Array.isArray(key) && key[0] === 'admin-products')`.
 */

export const meKey = ['me'] as const

export const cartKey = (userId: string) => ['cart', userId] as const

/** С `userId`, как и корзина: чужое избранное не должно достаться из кеша после смены аккаунта. */
export const wishlistKey = (userId: string) => ['wishlist', userId] as const

export const categoriesKey = ['categories'] as const

export const brandsKey = ['brands'] as const

/**
 * Админский список брендов зависит от того, показаны ли удалённые товары:
 * с ними в наборе появляются бренды, которых в живом каталоге уже нет.
 */
export const adminBrandsKey = (includeDeleted: boolean) =>
  ['admin-brands', includeDeleted] as const

export const cyclesKey = ['cycles'] as const

export const activeCycleKey = ['active-cycle'] as const

export const ORDERS_TAG = 'orders'

/**
 * Свои заявки — постранично, поэтому в ключе есть номер страницы, а сбрасывать
 * их нужно все разом: после оформления, отмены или правки меняется не только
 * открытая страница, но и то, как заявки разложены по остальным.
 */
export const ordersKey = (userId: string, page: number) =>
  [ORDERS_TAG, userId, page] as const

export const isOrdersKey = (key: unknown): boolean =>
  Array.isArray(key) && key[0] === ORDERS_TAG

export const orderKey = (userId: string, orderId: string) => ['order', userId, orderId] as const

export const ADMIN_OVERVIEW_TAG = 'admin-overview'

/** Счётчики зависят от активного сбора, поэтому ключ — с его id, а не голый тег. */
export const adminOverviewKey = (cycleId: string | null) =>
  [ADMIN_OVERVIEW_TAG, cycleId] as const

/** Инвалидация сводки вне зависимости от того, для какого сбора она была посчитана. */
export const isAdminOverviewKey = (key: unknown): boolean =>
  Array.isArray(key) && key[0] === ADMIN_OVERVIEW_TAG

export const adminOrdersKey = (cycleId: string, status: string, page: number) =>
  ['admin-orders', cycleId, status, page] as const

export const ADMIN_PRODUCTS_TAG = 'admin-products'

export const adminProductsKey = (
  q: string,
  category: string,
  brand: string,
  includeDeleted: boolean,
  page: number
) => [ADMIN_PRODUCTS_TAG, q, category, brand, includeDeleted, page] as const

export const adminProductKey = (id: string) => ['admin-product', id] as const

export const productSearchKey = (q: string, limit: number) => ['product-search', q, limit] as const

/** Инвалидация всех вариантов фильтров/страниц списка админ-товаров разом. */
export const isAdminProductsKey = (key: unknown): boolean =>
  Array.isArray(key) && key[0] === ADMIN_PRODUCTS_TAG
