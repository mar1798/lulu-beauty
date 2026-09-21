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

/**
 * Подсказки для поиска в шапке: три группы под один запрос.
 *
 * Отдельная ручка, а не `listProducts` с маленьким `pageSize`: там страница
 * каталога с полными товарами, а здесь выпадающий список, которому нужны ещё
 * категории и бренды, а из товара — одна картинка вместо всех.
 */
export interface ISuggestProduct {
  id: string
  name: string
  slug: string
  brand: string | null
  /** Цена самого дешёвого объёма, когда их несколько (см. `variantCount`). */
  priceCents: number
  /** Сколько объёмов у товара: больше одного — цена в строке подписывается «от». */
  variantCount: number
  inStock: boolean
  imageUrl: string | null
  imageAlt: string | null
}

export interface ISearchSuggestions {
  categories: { name: string; slug: string }[]
  brands: string[]
  products: ISuggestProduct[]
}

/** Пустой запрос ручка не принимает (422) — вызывать её незачем. */
export const SUGGEST_MIN_LENGTH = 1

/** И длиннее 255 символов тоже не принимает: поле в шапке обрезает набор по этой длине. */
export const SUGGEST_MAX_LENGTH = 255

export const suggestSearch = (q: string): Promise<ISearchSuggestions> =>
  api.get('/search/suggest', { query: { q } })
