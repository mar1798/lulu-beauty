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
  /**
   * Переход остаётся переходом — обработчик нужен тому, что должно закрыться
   * вместе с ним (мобильное меню). Навигацию он не подменяет и не отменяет.
   */
  onClick?: () => void
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
  /**
   * Файл не отдался. Нужен там, где адрес картинки — снапшот и может
   * «повиснуть»: позиция заявки хранит `productImageUrl` на момент
   * оформления, а сам файл владелец волен удалить вместе с товаром.
   */
  onError?: () => void
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
export type OtpPurpose = 'REGISTER' | 'LOGIN' | 'RESET_PASSWORD'
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
  /**
   * Метка мягкого удаления. В публичных списках всегда `null` — удалённые
   * товары туда не попадают; в админском листинге с `includeDeleted=true`
   * это единственный способ отличить удалённую строку от живой.
   */
  deletedAt: string | null
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
  /** Идентификатор строки заявки: правка и удаление адресуются им, а не товаром. */
  id: string
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
  /**
   * Покупатель ещё может править эту заявку: статус `PENDING` и сбор не закрыт.
   * Считает бэкенд — дедлайн лежит на сборе, а не на заявке, и правило должно
   * быть одно на API и на UI.
   */
  isEditable: boolean
  /**
   * Обратная сторона того же дедлайна: заявка отменена (`CANCELLED`), но сбор
   * ещё открыт — отмену можно отозвать. Вместе с `isEditable` истинным не
   * бывает: заявка либо в работе, либо отменена.
   */
  isRestorable: boolean
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
  variant?: 'ghost' | 'solid' | 'danger' | 'primary'
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
  type?: 'text' | 'tel' | 'email' | 'password' | 'number' | 'search' | 'time'
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
  /**
   * Подпись для скринридера там, где видимой подписи нет: в строке таблицы её
   * роль играет заголовок колонки, и дублировать её у каждого поля незачем.
   */
  ariaLabel?: string
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
  /** `brand` — розовый пульс для витринных мест (сетка каталога). */
  tone?: 'neutral' | 'brand'
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

export interface IAppearProps {
  children: ReactNode
  /**
   * Смена ключа проигрывает появление заново. Нужна там, где содержимое
   * подменяется без размонтирования — страница каталога, список заявок.
   */
  appearKey?: string
  /** Задержка в секундах: блоки одной страницы можно пустить лесенкой. */
  delay?: number
}

export interface IAlertProps {
  children: ReactNode
  title?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
  /**
   * Действие внутри сообщения: «повторить» у неудачной загрузки. Стоит под
   * текстом, а не сбоку — иначе на узком экране кнопка сжимает сам текст.
   */
  action?: ReactNode
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

export interface IMobileMenuProps {
  isOpen: boolean
  onClose: () => void
  navigation: ILinkedLabel[]
  /** `null` — гость: вместо профиля показывается вход и регистрация. */
  user?: IHeaderUser | null
  loginLink: ILink
  registerLink?: ILink
  cartLink: ILink
  cartCount?: number
  /** Текущий путь — тот же `aria-current`, что и в шапке. */
  currentHref?: string
  /** Слот под выход из аккаунта: сама панель ничего про сессию не знает. */
  footer?: ReactNode
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

/* --- Главная --- */

export interface ISectionHeadingProps {
  /** Надзаголовок капителью: «Свежая подборка», «Как это работает». */
  eyebrow?: string
  title: string
  description?: string
  /** Уровень для структуры документа; на внешность не влияет. */
  level?: IHeadingLevel
  /** Ссылка вбок: «весь каталог». */
  action?: ReactNode
}

export interface IStep {
  title: string
  description: string
}

export interface IStepListProps {
  steps: IStep[]
}

export interface IHomeHeroProps {
  /** Надзаголовок: имя ближайшего сбора или «Сбор закрыт». */
  eyebrow?: string
  title: string
  description?: string
  /** Кнопки: «в каталог», «войти». */
  actions?: ReactNode
  /**
   * Врезка сбоку: таймер до дедлайна или сообщение, что открытого сбора нет.
   * Отдельным слотом, потому что сбор — данные сайта, а не шаблона.
   */
  aside?: ReactNode
}

export interface IHomeTemplateProps {
  hero: ReactNode
  /** Секции: подборка товаров, «как это работает». Каждая — свой слот. */
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
  /** Уровень заголовка. По умолчанию 2 — блок обычно стоит прямо под `h1` страницы. */
  level?: IHeadingLevel
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

/* --- Авторизация --- */

export interface IAuthTemplateProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Ссылка «нет аккаунта?» и прочее под карточкой. */
  footer?: ReactNode
}

export interface ILoginValues {
  /** E.164 — в этом виде его отдаёт `PhoneInput` и ждёт бэкенд. */
  phone: string
  password: string
}

export interface ILoginFormProps {
  onSubmit: (values: ILoginValues) => void
  isSubmitting?: boolean
  /** Ошибка от сервера; ошибки полей форма считает сама. */
  error?: string | null
}

export interface IRegisterValues extends ILoginValues {
  name: string
}

export interface IRegisterFormProps {
  onSubmit: (values: IRegisterValues) => void
  isSubmitting?: boolean
  error?: string | null
}

export interface IOtpVerifyFormProps {
  onSubmit: (code: string) => void
  isSubmitting?: boolean
  error?: string | null
  /** Например, «Код отправлен на +996 555 12 34 56». */
  hint?: string
  /** Слот «запросить новый код» — способ повтора зависит от страницы. */
  resendAction?: ReactNode
}

export interface IForgotPasswordValues {
  /** E.164 — в этом виде его отдаёт `PhoneInput` и ждёт бэкенд. */
  phone: string
}

export interface IForgotPasswordFormProps {
  onSubmit: (values: IForgotPasswordValues) => void
  isSubmitting?: boolean
  error?: string | null
}

export interface IResetPasswordValues {
  code: string
  password: string
}

export interface IResetPasswordFormProps {
  onSubmit: (values: IResetPasswordValues) => void
  isSubmitting?: boolean
  error?: string | null
  /** Например, «Код отправлен на +996 555 12 34 56». */
  hint?: string
  /** Слот «запросить новый код» — способ повтора зависит от страницы. */
  resendAction?: ReactNode
}

export interface ITelegramLinkPromptProps {
  /** Имя бота без `@`. Пустая строка — переменная окружения не настроена. */
  botUsername: string
  isLinked?: boolean
}

/* --- Корзина и оформление --- */

export interface IDeadlineCountdownProps {
  /** ISO-строка дедлайна активного сбора; `null` — сбора нет. */
  deadlineAt: string | null
  label?: string
  expiredLabel?: string
}

export interface IQuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  /** Уходит в `aria-label` группы — в списке позиций их несколько. */
  label?: string
}

export interface ICartItemRowProps {
  item: ICartItem
  href: string
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
  /** Идёт запрос: блокирует контролы, чтобы не отправить два подряд. */
  isBusy?: boolean
}

export interface ICartPanelProps {
  cart: ICart | null
  buildProductHref: (productSlug: string) => string
  onQuantityChange: (productId: string, quantity: number) => void
  onRemove: (productId: string) => void
  onCheckout: () => void
  /**
   * Первая загрузка корзины: рисуются скелетоны в её раскладке. Отличается
   * от `isBusy` — тот про запрос поверх уже показанной корзины.
   */
  isLoading?: boolean
  skeletonRows?: number
  isBusy?: boolean
  error?: string | null
  /** Показывается и на пустой корзине, и когда корзины ещё нет. */
  emptyState?: ReactNode
}

export interface ICheckoutFormProps {
  totalCents: number
  itemCount: number
  deadlineAt?: string | null
  /** `null` — комментарий не заполнен; ровно это ждёт `CheckoutRequest`. */
  onSubmit: (note: string | null) => void
  /** Корзина ещё грузится: скелетон в раскладке формы. */
  isLoading?: boolean
  isSubmitting?: boolean
  error?: string | null
}

export interface ICartTemplateProps {
  title: string
  summary?: string
  breadcrumbs?: ReactNode
  children: ReactNode
}

/* --- Заявки покупателя и профиль --- */

export interface IOrderStatusBadgeProps {
  status: OrderStatus
}

export interface IOrderItemRowProps {
  item: IOrderItem
  /**
   * `null` — товара больше нет в каталоге (`productId === null` в снапшоте),
   * вести ссылке некуда, а название остаётся видно.
   */
  href: string | null
  /**
   * Управление количеством и удалением. Обе отсутствуют — строка только для
   * чтения: так заявка выглядит после дедлайна и у владельца в админке.
   */
  onQuantityChange?: (quantity: number) => void
  onRemove?: () => void
  /**
   * Единственную позицию убрать нельзя — бэкенд ответит отказом. Кнопка
   * остаётся видимой, но заблокированной, с подсказкой отменить заявку целиком.
   */
  canRemove?: boolean
  isBusy?: boolean
}

export interface IOrderCardProps {
  order: IOrder
  href: string
}

export interface IOrderListProps {
  orders: IOrder[]
  buildHref: (order: IOrder) => string
  isLoading?: boolean
  skeletonCount?: number
  emptyState?: ReactNode
}

export interface IOrderDetailsProps {
  /** `null` — заявки ещё нет: вместе с `isLoading` рисуется скелетон. */
  order: IOrder | null
  /** Первая загрузка: скелетон в раскладке карточки. */
  isLoading?: boolean
  skeletonRows?: number
  buildProductHref: (productSlug: string) => string
  /** Заявка относится к ещё открытому сбору — состав можно обсудить с владельцем. */
  isCurrentCycle?: boolean
  /**
   * Правка состава. Показывается, только когда переданы обработчики **и**
   * `order.isEditable`: одного флага мало (в админке правки нет), одних
   * обработчиков — тоже (после дедлайна бэкенд откажет).
   */
  onItemQuantityChange?: (itemId: string, quantity: number) => void
  onItemRemove?: (itemId: string) => void
  /**
   * Слот под добавление товара (`ProductPicker`): показывается на тех же двух
   * условиях, что и правка. Поиском по каталогу занимается страница — карточка
   * заявки в API не ходит.
   */
  addItem?: ReactNode
  /** Сохранение комментария. `null` очищает его. */
  onNoteSave?: (note: string | null) => void
  /** Отмена заявки покупателем: заявка не исчезает, а получает статус «Отменена». */
  onCancel?: () => void
  /**
   * Возврат отменённой заявки в работу. Показывается по `order.isRestorable`:
   * пока сбор открыт, отмена — обратимое решение, и оформлять всё заново ради
   * неё не нужно.
   */
  onRestore?: () => void
  isBusy?: boolean
  error?: string | null
}

export interface IProductPickerProps {
  query: string
  onQueryChange: (query: string) => void
  /**
   * Найденные товары. `null` — результатов ещё нет: либо не искали, либо идёт
   * первый запрос (вместе с `isSearching` рисуется скелетон).
   */
  products: IProduct[] | null
  isSearching?: boolean
  /** Товары, которые уже есть в заявке: добавление сольётся с их строкой. */
  addedProductIds?: string[]
  onAdd: (productId: string) => void
  isBusy?: boolean
  /** Поиск не отдался. Отличается от пустого ответа: искать стоит ещё раз. */
  error?: string | null
  label?: string
  /** Подсказка под пустым поиском — объясняет, куда попадёт найденный товар. */
  hint?: string
}

export interface IProfileFormProps {
  /** `null` — профиль ещё грузится; вместе с `isLoading` рисуется скелетон. */
  user: IAuthUser | null
  /** Первая загрузка профиля: скелетон в раскладке формы. */
  isLoading?: boolean
  /** Телефон менять нельзя: он же логин и цель OTP. Наружу уходит только имя. */
  onSubmit: (name: string) => void
  isSubmitting?: boolean
  error?: string | null
  isSaved?: boolean
  /** Слот под выход из аккаунта и привязку Telegram. */
  footer?: ReactNode
}

export interface IAccountTemplateProps {
  title: string
  summary?: string
  /** Разделы личного кабинета: «Мои заявки», «Профиль». */
  navigation: ILinkedLabel[]
  /** Текущий путь — для `aria-current` в навигации раздела. */
  currentHref?: string
  children: ReactNode
}

export interface IErrorTemplateProps {
  /**
   * Код ответа крупной цифрой. Необязателен: тем же шаблоном рисуется и
   * экран без кода — например, «раздел временно недоступен».
   */
  code?: string
  title: string
  description?: string
  /** Кнопки «в каталог», «повторить». */
  actions?: ReactNode
  /**
   * Подробности для владельца: текст ошибки, идентификатор запроса.
   * Покупателю в них смысла нет, поэтому это отдельный приглушённый блок,
   * а не часть описания.
   */
  details?: ReactNode
}

/* --- Модальный слой, подтверждения, уведомления --- */

export interface IModalProps {
  isOpen: boolean
  onClose: () => void
  /** Обязателен: диалог без имени скринридер объявляет как «диалог». */
  title: string
  children: ReactNode
  /** Кнопки внизу: подтвердить/отменить, сохранить. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Закрытие по клику мимо окна. Отключается там, где форма не должна теряться. */
  isDismissable?: boolean
}

export interface IConfirmDialogProps {
  isOpen: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` — для необратимых действий: удаление товара, категории, сбора. */
  tone?: 'danger' | 'primary'
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export type IToastTone = 'info' | 'success' | 'danger'

export interface IToast {
  id: string
  tone: IToastTone
  title: string
  description?: string
}

export interface IToastProps {
  toast: IToast
  onDismiss: (id: string) => void
}

export interface IToastViewportProps {
  toasts: IToast[]
  onDismiss: (id: string) => void
}

/* --- Загрузка файлов и статусы --- */

/**
 * Drag&drop-загрузка одного файла. Ограничения задаются явно и повторяют
 * лимиты бэкенда (`apps/api/app/catalog/router.py`): картинки — 5 MB и
 * `image/jpeg|png|webp`, файл импорта — 10 MB и `.xlsx`/`.csv`.
 */
export interface IFileDropzoneProps {
  onSelect: (file: File) => void
  /** Атрибут `accept` нативного выбора файла. */
  accept?: string
  /** Разрешённые MIME-типы; пусто — не проверять. */
  allowedTypes?: string[]
  /** Разрешённые расширения с точкой (`.xlsx`) — для файлов, чей MIME непредсказуем. */
  allowedExtensions?: string[]
  maxBytes?: number
  label?: string
  hint?: string
  /** Ошибка снаружи (ответ сервера); ошибки лимитов дропзона считает сама. */
  error?: string | null
  disabled?: boolean
  buttonLabel?: string
}

export interface IStatusSelectProps {
  value: OrderStatus
  onChange: (status: OrderStatus) => void
  label?: string
  /** Подпись остаётся для скринридера, но не занимает место в строке таблицы. */
  isLabelHidden?: boolean
  disabled?: boolean
}

/* --- Админка --- */

export interface IAdminNavItem extends ILinkedLabel {
  icon?: ReactNode
}

export interface IAdminLayoutProps {
  title: string
  summary?: string
  navigation: IAdminNavItem[]
  currentHref?: string
  /** Кнопки раздела: «Добавить товар», «Скачать выгрузку». */
  actions?: ReactNode
  children: ReactNode
}

export interface IAdminProductsTableProps {
  products: IProduct[]
  /** Название категории по её id: у товара приходит только `categoryId`. */
  categoryNames: Record<string, string>
  buildEditHref: (product: IProduct) => string
  onDelete: (product: IProduct) => void
  onRestore: (product: IProduct) => void
  isLoading?: boolean
  skeletonRows?: number
  /** id товара, по которому идёт запрос: блокирует кнопки только этой строки. */
  busyId?: string | null
  emptyState?: ReactNode
}

export interface IAdminProductValues {
  name: string
  slug: string
  description: string
  priceCents: number
  categoryId: string | null
  inStock: boolean
}

export interface IProductImageUpload {
  file: File
  alt: string
  isPrimary: boolean
}

export interface IAdminProductFormProps {
  categories: ICategory[]
  /** Редактирование; `undefined` — создание нового товара. */
  product?: IProduct
  onSubmit: (values: IAdminProductValues) => void
  isSubmitting?: boolean
  error?: string | null
  /**
   * Картинки есть только у сохранённого товара: загружать их некуда, пока
   * у него нет id. При создании блок не рендерится.
   */
  images?: IProductImage[]
  onImageUpload?: (upload: IProductImageUpload) => void
  onImageDelete?: (image: IProductImage) => void
  isImageBusy?: boolean
  imageError?: string | null
  /** Слот под удаление/восстановление товара. */
  footer?: ReactNode
}

export interface IAdminCategoryValues {
  name: string
  slug: string
  sortOrder: number
}

export interface IAdminCategoriesPanelProps {
  categories: ICategory[]
  onCreate: (values: IAdminCategoryValues) => void
  onUpdate: (category: ICategory, values: IAdminCategoryValues) => void
  onDelete: (category: ICategory) => void
  isLoading?: boolean
  /** Идёт запрос: контролы блокируются целиком, порядок строк может измениться. */
  isBusy?: boolean
  error?: string | null
}

export interface IAdminImportPanelProps {
  onImport: (file: File) => void
  isImporting?: boolean
  /** Итог последнего импорта; `null`/`undefined` — импорта ещё не было. */
  summary?: IImportSummary | null
  /** Ошибка запроса. Ошибки строк приходят внутри `summary.errors`. */
  error?: string | null
}

/** Черновик сбора в календарных величинах магазина (таймзона `Asia/Bishkek`). */
export interface ICycleDraft {
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM`. */
  time: string
  label: string
}

export interface IAdminCycleCalendarProps {
  cycles: IOrderCycle[]
  /** Показываемый месяц, `YYYY-MM`. */
  month: string
  onMonthChange: (month: string) => void
  onCreate: (draft: ICycleDraft) => void
  onUpdate: (cycle: IOrderCycle, draft: ICycleDraft) => void
  onDelete: (cycle: IOrderCycle) => void
  /**
   * id сбора, который бэкенд отдаёт как активный. Считается не по полю
   * `status`, а по ближайшему будущему дедлайну — `status` переставляет
   * планировщик, и до его прогона он отстаёт от факта.
   */
  activeCycleId?: string | null
  /**
   * Сегодняшняя дата в таймзоне магазина, `YYYY-MM-DD`. Приходит пропсом,
   * а не считается внутри: админка рендерится на сервере, и вычисленное
   * в компоненте «сегодня» разошлось бы с гидратацией на границе суток.
   */
  today?: string
  isLoading?: boolean
  isBusy?: boolean
  error?: string | null
}

export interface IAdminOrdersTableProps {
  orders: IAdminOrder[]
  onStatusChange: (order: IAdminOrder, status: OrderStatus) => void
  /**
   * Удаление у владельца — настоящее, в отличие от покупательской отмены:
   * заявка исчезает и из списка, и из выгрузок. Без обработчика колонка
   * действий не рендерится вовсе.
   */
  onDelete?: (order: IAdminOrder) => void
  buildProductHref: (productSlug: string) => string
  isLoading?: boolean
  skeletonRows?: number
  busyId?: string | null
  emptyState?: ReactNode
}
