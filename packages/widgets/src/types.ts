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

/** Размерная шкала, общая для кнопок и полей. */
export type IControlSize = 'sm' | 'md' | 'lg'

export type ITone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'brand'
  | 'danger'
  | 'success'

export interface IButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: IControlSize
  type?: 'button' | 'submit' | 'reset'
  isLoading?: boolean
  disabled?: boolean
  isFullWidth?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
  /** Ссылочный режим: кнопка рендерится через `AppLink`, сохраняя внешность. */
  link?: ILink
  onClick?: () => void
}

export interface IIconButtonProps {
  icon: ReactNode
  /** Обязателен: иконка без подписи для скринридера пуста. */
  label: string
  variant?: 'ghost' | 'solid' | 'danger'
  size?: IControlSize
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  onClick?: () => void
}

export interface IInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  label?: string
  hint?: string
  /** Непустая строка включает состояние ошибки и `aria-invalid`. */
  error?: string | null
  type?: 'text' | 'tel' | 'email' | 'password' | 'number' | 'search'
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'search' | 'url'
  maxLength?: number
  disabled?: boolean
  required?: boolean
  readOnly?: boolean
  prefix?: ReactNode
  suffix?: ReactNode
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  onFocus?: React.FocusEventHandler<HTMLInputElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}

/** Тип поля и суффикс заняты переключателем видимости. */
export type IPasswordInputProps = Omit<IInputProps, 'type' | 'prefix' | 'suffix'>

/** Префикс занят кодом страны, тип — `tel`. */
export interface IPhoneInputProps
  extends Omit<IInputProps, 'type' | 'prefix' | 'suffix' | 'inputMode' | 'autoComplete'> {
  /** Код страны без `+`. Значение наружу всегда уходит в E.164. */
  dialCode?: string
}

export interface IOtpInputProps {
  value: string
  onChange: (value: string) => void
  /** Вызывается, когда набраны все `length` цифр. */
  onComplete?: (value: string) => void
  length?: number
  label?: string
  error?: string | null
  disabled?: boolean
  autoFocus?: boolean
}

export interface ITextareaProps {
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  label?: string
  hint?: string
  error?: string | null
  placeholder?: string
  rows?: number
  /** Включает счётчик символов под полем. */
  maxLength?: number
  disabled?: boolean
  required?: boolean
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>
}

export interface ISelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface ISelectProps {
  value: string
  onChange: (value: string) => void
  options: ISelectOption[]
  id?: string
  name?: string
  label?: string
  hint?: string
  error?: string | null
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

export interface ICheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  id?: string
  name?: string
  disabled?: boolean
}

export interface ISwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  id?: string
  name?: string
  disabled?: boolean
}

export interface IBadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
  /** Точка-индикатор: статус не должен читаться только по цвету. */
  withDot?: boolean
}

export interface IPriceProps {
  /** Копейки, ровно как отдаёт бэкенд. */
  priceCents: number
  currency?: string
  size?: IControlSize
}

export interface ISpinnerProps {
  size?: IControlSize
  /** `null` гасит подпись — когда «загрузку» уже объявил родитель. */
  label?: string | null
}

export interface ISkeletonProps {
  width?: number | string
  height?: number | string
  shape?: 'text' | 'block' | 'circle'
}

export type IHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface IHeadingProps {
  children: ReactNode
  /** Структура документа; на внешность не влияет. */
  level?: IHeadingLevel
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'primary' | 'brand' | 'inverse'
  id?: string
}

export interface ITextProps {
  children: ReactNode
  as?: 'p' | 'span' | 'div'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  weight?: 'regular' | 'medium' | 'semibold'
  tone?: ITone
  /** Обрезка в N строк — названия товаров в карточках. */
  clamp?: 1 | 2 | 3
}

export interface IChipProps {
  label: string
  isSelected?: boolean
  count?: number
  disabled?: boolean
  onToggle: (isSelected: boolean) => void
}

export interface IAlertProps {
  children: ReactNode
  title?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
  onClose?: () => void
}

export interface IFileInputProps {
  onSelect: (files: File[]) => void
  /** MIME-типы или расширения, ровно как их ограничивает бэкенд. */
  accept?: string
  multiple?: boolean
  label?: string
  hint?: string
  error?: string | null
  buttonLabel?: string
  disabled?: boolean
}

export interface IContainerProps {
  children: ReactNode
  as?: 'div' | 'section' | 'main' | 'header' | 'footer' | 'article'
  width?: 'narrow' | 'medium' | 'wide'
  isPadded?: boolean
}

export interface IDividerProps {
  orientation?: 'horizontal' | 'vertical'
  /** По умолчанию линия декоративная и скринридером не объявляется. */
  isSemantic?: boolean
}

export interface IVisuallyHiddenProps {
  children: ReactNode
}

export interface IPortalProps {
  children: ReactNode
  /** По умолчанию `document.body`. */
  container?: Element | null
}

export interface IHeaderUser {
  name: string
  link: ILink
}

export interface IHeaderProps {
  logo: ILinkedLabel
  navigation: ILinkedLabel[]
  cartLink: ILink
  cartCount?: number
  /** `null` — гость: вместо профиля показывается ссылка на вход. */
  user?: IHeaderUser | null
  loginLink: ILink
  /** Текущий путь — для `aria-current` в навигации. */
  currentHref?: string
  /** Полоса под шапкой: дедлайн текущего сбора. */
  notice?: ReactNode
  /** Кнопка мобильного меню появляется только когда обработчик задан. */
  onMenuClick?: () => void
}

export interface IFooterColumn {
  title: string
  links: ILinkedLabel[]
}

export interface IFooterProps {
  columns: IFooterColumn[]
  copyright: string
  note?: string
}

export interface IBaseLayoutProps {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}

/* --- Витрина --- */

export interface IProductCardProps {
  product: IProduct
  href: string
  sizes?: ISizes
  /** Слот под «в корзину»: внутрь ссылки-карточки кнопку класть нельзя. */
  action?: ReactNode
}

export interface IPaginationProps {
  page: number
  pageSize: number
  /** Всего товаров, а не страниц — так его отдаёт `IPage<T>`. */
  total: number
  onChange: (page: number) => void
}

export interface ICategoryFilterProps {
  categories: ICategory[]
  /** **Слаг**, а не id: по нему фильтрует `GET /products?category=`. `null` — все. */
  selectedSlug?: string | null
  onSelect: (slug: string | null) => void
  allLabel?: string
}

export interface IEmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export interface ISearchFieldProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
}

export interface IProductGalleryProps {
  images: IProductImage[]
  /** Запасной `alt`, когда у картинки его нет. */
  productName: string
}

export interface IBreadcrumbsProps {
  items: ILinkedLabel[]
  /** Текущая страница — ссылкой не оформляется. */
  current: string
}

export interface IProductGridProps {
  products: IProduct[]
  buildHref: (product: IProduct) => string
  isLoading?: boolean
  skeletonCount?: number
  /** Что показать, когда ничего не нашлось. */
  emptyState?: ReactNode
  renderAction?: (product: IProduct) => ReactNode
}

export interface IProductDetailsProps {
  product: IProduct
  /** Название категории: у товара приходит только `categoryId`. */
  categoryName?: string | null
  action?: ReactNode
}

export interface ICatalogTemplateProps {
  title: string
  summary?: string
  search?: ReactNode
  filter?: ReactNode
  children: ReactNode
  pagination?: ReactNode
}

export interface IProductTemplateProps {
  breadcrumbs?: ReactNode
  children: ReactNode
}
