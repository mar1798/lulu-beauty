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

export const categoriesKey = ['categories'] as const

export const cyclesKey = ['cycles'] as const

export const activeCycleKey = ['active-cycle'] as const

export const ordersKey = (userId: string) => ['orders', userId] as const

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
  includeDeleted: boolean,
  page: number
) => [ADMIN_PRODUCTS_TAG, q, category, includeDeleted, page] as const

export const adminProductKey = (id: string) => ['admin-product', id] as const

export const productSearchKey = (q: string, limit: number) => ['product-search', q, limit] as const

/** Инвалидация всех вариантов фильтров/страниц списка админ-товаров разом. */
export const isAdminProductsKey = (key: unknown): boolean =>
  Array.isArray(key) && key[0] === ADMIN_PRODUCTS_TAG
