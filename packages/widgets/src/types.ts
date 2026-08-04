import type { ISizes } from './utils'
import type React from 'react'
import type { ReactNode } from 'react'

export interface IWrapperComponent {
  children?: React.ReactNode
}

export interface ILink {
  href: string
  target?: React.HTMLAttributeAnchorTarget
  ['aria-label']?: string
  legacy?: boolean
}
export interface ILinkedLabel {
  label: string
  link: ILink
}

export interface IBasicStyling {
  className?: string
}

/**
 * Картинка. `width`/`height` необязательны: у картинок товара их нет —
 * API отдаёт только `url`/`alt`, поэтому такие картинки рендерятся
 * в режиме `fill` внутри бокса с заданным `aspect-ratio`.
 */
export interface IImage {
  src: string | StaticImageData
  alt: string
  title?: string
  width?: number
  height?: number
}

export interface StaticImageData {
  src: string
  height: number
  width: number
  blurDataURL?: string
  blurWidth?: number
  blurHeight?: number
}

export interface IImageComponentProps {
  image: IImage
  sizes: ISizes
  priority?: boolean
  /**
   * Растянуть картинку по родителю (`object-fit: cover`) вместо собственных
   * размеров. Родитель обязан быть `position: relative` с заданной высотой
   * или `aspect-ratio`.
   */
  fill?: boolean
}

/* ------------------------------------------------------------------ *
 * DTO бэкенда (`apps/api`).
 *
 * Все поля — camelCase, ровно как отдаёт `CamelModel`. Enum — строковые
 * union-типы, а не TS enum (union сериализуется как есть и не требует
 * рантайм-объекта). Идентификаторы — UUID-строки, даты — ISO-строки.
 * ------------------------------------------------------------------ */

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED'
export type CycleStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED'
export type OtpPurpose = 'REGISTER' | 'LOGIN'
export type Role = 'CUSTOMER' | 'ADMIN'

/** Конверт пагинации: `GET /products`, `GET /admin/products`, `GET /admin/orders`. */
export interface IPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ICategory {
  id: string
  name: string
  slug: string
  sortOrder: number
}

export interface IProductImage {
  id: string
  url: string
  alt: string | null
  sortOrder: number
  isPrimary: boolean
}

export interface IProduct {
  id: string
  name: string
  slug: string
  description: string | null
  priceCents: number
  /** Публичный `GET /products?category=` фильтрует по **слагу**, а не по id — маппинг держит фронт. */
  categoryId: string | null
  inStock: boolean
  images: IProductImage[]
}

/**
 * Позиция корзины. Своего `id` у неё нет: и `PATCH`, и `DELETE`
 * в `/cart/items/{productId}` адресуются идентификатором товара.
 */
export interface ICartItem {
  productId: string
  productName: string
  productSlug: string
  productImageUrl: string | null
  productPriceCents: number
  quantity: number
  lineTotalCents: number
}

/**
 * Корзина. `cycleId`/`cycleDeadlineAt` — `null`, когда активного цикла нет:
 * это штатное состояние витрины, а не ошибка.
 */
export interface ICart {
  cycleId: string | null
  cycleDeadlineAt: string | null
  items: ICartItem[]
  totalCents: number
}

/**
 * Позиция заявки — снапшот на момент чекаута, а не текущее состояние товара.
 * `productId` — `null`, если товар с тех пор удалён.
 */
export interface IOrderItem {
  productId: string | null
  productName: string
  productSlug: string
  productImageUrl: string | null
  productPriceCents: number
  quantity: number
  lineTotalCents: number
}

export interface IOrder {
  id: string
  cycleId: string
  status: OrderStatus
  totalCents: number
  note: string | null
  createdAt: string
  items: IOrderItem[]
}

/**
 * Заявка глазами админки: то же тело плюс покупатель.
 * Покупательские `GET /orders`, `GET /orders/{id}` и `POST /orders/checkout`
 * отдают `IOrder` — **без** этих полей.
 */
export interface IAdminOrder extends IOrder {
  customerName: string
  customerPhone: string
}

export interface IOrderCycle {
  id: string
  deadlineAt: string
  label: string | null
  status: CycleStatus
  reminderSentAt: string | null
  closedAt: string | null
}

export interface IAuthUser {
  id: string
  phone: string
  name: string
  role: Role
  phoneVerified: boolean
  telegramLinked: boolean
}

/** Строка импорта xlsx/csv, которую бэк не смог разобрать. */
export interface IImportRowError {
  row: number
  message: string
}

export interface IImportSummary {
  created: number
  updated: number
  errors: IImportRowError[]
}

/* ------------------------------------------------------------------ *
 * Пропсы компонентов. Шаблон генератора (`tools/templates/react/component`)
 * импортирует `I__name__Props` отсюда, поэтому интерфейс пропсов каждого
 * нового компонента добавляется в этот файл.
 * ------------------------------------------------------------------ */
