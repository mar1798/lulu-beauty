import type { ICategory, IPage, IProduct } from 'widgets/types'
import { api } from '../api'

/**
 * Публичный каталог: доступен и с сервера (getStaticProps/ISR), и из браузера.
 * Авторизация не нужна ни там, ни там.
 */

export interface IProductListParams {
  /**
   * **Slug** категории, а не её id: бэк сравнивает `Category.slug`
   * (`app/catalog/service.py`), хотя в `IProduct` лежит `categoryId`.
   * Экрану каталога нужна карта id → slug из `listCategories()`.
   */
  category?: string
  /**
   * Название бренда целиком, а не слаг: бренд у товара — свободная строка
   * (её приносит импорт xlsx), отдельной таблицы под него нет. Значения для
   * фильтра берутся из `listBrands()`, поэтому совпадение всегда точное.
   */
  brand?: string
  inStock?: boolean
  q?: string
  page?: number
  pageSize?: number
}

export const listCategories = (): Promise<ICategory[]> => api.get('/categories')

/** Бренды, реально встречающиеся в каталоге, — варианты для фильтра. */
export const listBrands = (): Promise<string[]> => api.get('/brands')

/** Публичная ручка списка товаров держит snake_case-параметры (в отличие от админской). */
export const listProducts = (params: IProductListParams = {}): Promise<IPage<IProduct>> =>
  api.get('/products', {
    query: {
      category: params.category,
      brand: params.brand,
      in_stock: params.inStock,
      q: params.q,
      page: params.page,
      page_size: params.pageSize,
    },
  })

export const getProduct = (slug: string): Promise<IProduct> =>
  api.get(`/products/${encodeURIComponent(slug)}`)
