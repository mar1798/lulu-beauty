import faker from './faker'
import {
  IAccountTemplateProps,
  IAlertProps,
  IAuthTemplateProps,
  IAuthUser,
  ICart,
  ICartItem,
  ICartItemRowProps,
  ICartPanelProps,
  ICartTemplateProps,
  IBadgeProps,
  IBaseLayoutProps,
  IBreadcrumbsProps,
  IButtonProps,
  ICatalogTemplateProps,
  ICategory,
  ICategoryFilterProps,
  ICheckoutFormProps,
  ICheckboxProps,
  IChipProps,
  IContainerProps,
  IDeadlineCountdownProps,
  IDividerProps,
  IEmptyStateProps,
  IFileInputProps,
  IFooterProps,
  IHeadingProps,
  IHeaderProps,
  IIconButtonProps,
  IImage,
  IInputProps,
  ILink,
  ILoginFormProps,
  IOrder,
  IOrderCardProps,
  IOrderDetailsProps,
  IOrderItem,
  IOrderItemRowProps,
  IOrderListProps,
  IOrderStatusBadgeProps,
  IOtpInputProps,
  IOtpVerifyFormProps,
  IPaginationProps,
  IProfileFormProps,
  IPasswordInputProps,
  IPhoneInputProps,
  IPortalProps,
  IPriceProps,
  IProduct,
  IProductCardProps,
  IProductDetailsProps,
  IProductGalleryProps,
  IProductGridProps,
  IProductImage,
  IProductTemplateProps,
  IQuantityStepperProps,
  IRegisterFormProps,
  ISearchFieldProps,
  ISelectProps,
  ISkeletonProps,
  ISpinnerProps,
  ISwitchProps,
  ITelegramLinkPromptProps,
  ITextProps,
  ITextareaProps,
  IVisuallyHiddenProps,
} from '../types'

export const repeatFeed = <T>(val: T, times: number): T[] => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return new Array(times).fill(val)
}

export const feedImage = (w: number, h: number): IImage => ({
  src: faker.image.url({ width: w, height: h }),
  alt: 'Avataar',
  title: 'Dicebear Avatar',
  width: w,
  height: h,
})

/**
 * Картинка товара — без размеров, ровно как её отдаёт API (только `url`/`alt`).
 * Рендерится в режиме `fill`, см. `IImageComponentProps`.
 */
export const feedProductImage = (): IImage => ({
  src: faker.image.url({ width: 600, height: 750 }),
  alt: faker.commerce.productName(),
})

export const feedLink = (src = 'https://google.com'): ILink => ({
  href: src,
  target: '_blank',
})

/* ------------------------------------------------------------------ *
 * Фикстуры компонентов. Шаблоны генератора (`story.stories.tsx` и
 * `__name__.test.tsx`) импортируют отсюда `feed__name__`, поэтому на
 * каждый новый компонент здесь появляется своя фабрика.
 *
 * Фикстуры возвращают именно пропсы — стори и тест получают одно и то же
 * состояние, и расхождение «в Storybook работает, в тесте падает» отпадает.
 * ------------------------------------------------------------------ */

/** Заглушка обработчика: фикстуры статичны, состояние живёт в стори. */
const noop = (): void => undefined

export const feedButton = (): IButtonProps => ({
  children: 'Добавить в корзину',
  variant: 'primary',
  size: 'md',
})

export const feedIconButton = (): IIconButtonProps => ({
  icon: '✕',
  label: 'Удалить позицию',
})

export const feedInput = (): IInputProps => ({
  value: '',
  onChange: noop,
  label: 'Имя',
  placeholder: 'Как к вам обращаться',
})

export const feedPasswordInput = (): IPasswordInputProps => ({
  value: '',
  onChange: noop,
  label: 'Пароль',
  hint: 'Не короче 8 символов',
})

export const feedPhoneInput = (): IPhoneInputProps => ({
  value: '',
  onChange: noop,
  label: 'Телефон',
})

export const feedOtpInput = (): IOtpInputProps => ({
  value: '',
  onChange: noop,
  label: 'Код из Telegram',
})

export const feedTextarea = (): ITextareaProps => ({
  value: '',
  onChange: noop,
  label: 'Комментарий к заявке',
  maxLength: 2000,
})

export const feedSelect = (): ISelectProps => ({
  value: '',
  onChange: noop,
  label: 'Категория',
  placeholder: 'Все категории',
  options: [
    { value: 'skincare', label: 'Уход за кожей' },
    { value: 'makeup', label: 'Макияж' },
    { value: 'hair', label: 'Волосы' },
  ],
})

export const feedCheckbox = (): ICheckboxProps => ({
  checked: false,
  onChange: noop,
  label: 'Только в наличии',
})

export const feedSwitch = (): ISwitchProps => ({
  checked: true,
  onChange: noop,
  label: 'Товар в наличии',
})

export const feedBadge = (): IBadgeProps => ({
  children: 'Собирается',
  tone: 'warning',
  withDot: true,
})

export const feedPrice = (): IPriceProps => ({
  priceCents: 125_000,
})

export const feedSpinner = (): ISpinnerProps => ({
  size: 'md',
})

export const feedSkeleton = (): ISkeletonProps => ({
  width: 240,
  height: 16,
})

export const feedHeading = (): IHeadingProps => ({
  children: 'Новинки сезона',
  level: 2,
})

export const feedText = (): ITextProps => ({
  children: faker.commerce.productDescription(),
  tone: 'secondary',
})

export const feedChip = (): IChipProps => ({
  label: 'Уход за кожей',
  count: 12,
  onToggle: noop,
})

export const feedAlert = (): IAlertProps => ({
  children: 'Проверьте правильность заполнения полей.',
  title: 'Не получилось сохранить',
  tone: 'danger',
})

export const feedFileInput = (): IFileInputProps => ({
  onSelect: noop,
  label: 'Фотографии товара',
  accept: 'image/*',
  multiple: true,
  hint: 'JPEG или PNG, до 5 МБ',
})

export const feedContainer = (): IContainerProps => ({
  children: 'Содержимое страницы',
  isPadded: true,
})

export const feedDivider = (): IDividerProps => ({
  orientation: 'horizontal',
})

export const feedVisuallyHidden = (): IVisuallyHiddenProps => ({
  children: 'Текст только для скринридера',
})

export const feedPortal = (): IPortalProps => ({
  children: 'Содержимое портала',
})

export const feedHeader = (): IHeaderProps => ({
  logo: { label: 'Lulu Beauty', link: { href: '/' } },
  navigation: [
    { label: 'Каталог', link: { href: '/catalog' } },
    { label: 'Как заказать', link: { href: '/how-to-order' } },
    { label: 'Мои заявки', link: { href: '/orders' } },
  ],
  cartLink: { href: '/cart' },
  cartCount: 3,
  user: { name: 'Айгуль', link: { href: '/account' } },
  loginLink: { href: '/login' },
  currentHref: '/catalog',
  notice: 'Приём заявок закрывается 12 августа',
})

export const feedFooter = (): IFooterProps => ({
  columns: [
    {
      title: 'Каталог',
      links: [
        { label: 'Уход за кожей', link: { href: '/catalog/skincare' } },
        { label: 'Макияж', link: { href: '/catalog/makeup' } },
      ],
    },
    {
      title: 'Покупателям',
      links: [
        { label: 'Как заказать', link: { href: '/how-to-order' } },
        { label: 'Доставка', link: { href: '/delivery' } },
      ],
    },
  ],
  copyright: '© 2026 Lulu Beauty',
  note: 'Оплата и доставка обсуждаются лично',
})

export const feedBaseLayout = (): IBaseLayoutProps => ({
  header: 'Шапка',
  footer: 'Подвал',
  children: 'Содержимое страницы',
})

/* --- Витрина --- */

const PRICE_MIN = 25_000
const PRICE_MAX = 450_000

export const feedCategory = (name?: string): ICategory => ({
  id: faker.string.uuid(),
  name: name ?? faker.commerce.department(),
  slug: faker.lorem.slug(2),
  sortOrder: faker.number.int({ min: 0, max: 10 }),
})

export const feedProductImageDto = (isPrimary = false, sortOrder = 0): IProductImage => ({
  id: faker.string.uuid(),
  url: faker.image.url({ width: 600, height: 750 }),
  alt: faker.commerce.productName(),
  sortOrder,
  isPrimary,
})

export const feedProduct = (overrides: Partial<IProduct> = {}): IProduct => ({
  id: faker.string.uuid(),
  name: faker.commerce.productName(),
  slug: faker.lorem.slug(3),
  description: faker.commerce.productDescription(),
  priceCents: faker.number.int({ min: PRICE_MIN, max: PRICE_MAX }),
  categoryId: faker.string.uuid(),
  inStock: true,
  images: [feedProductImageDto(true, 0), feedProductImageDto(false, 1)],
  ...overrides,
})

export const feedProductCard = (): IProductCardProps => {
  const product = feedProduct()

  return { product, href: `/catalog/${product.slug}` }
}

export const feedPagination = (): IPaginationProps => ({
  page: 3,
  pageSize: 20,
  total: 147,
  onChange: noop,
})

export const feedCategoryFilter = (): ICategoryFilterProps => ({
  categories: [
    feedCategory('Уход за кожей'),
    feedCategory('Макияж'),
    feedCategory('Волосы'),
    feedCategory('Парфюмерия'),
  ],
  selectedSlug: null,
  onSelect: noop,
})

export const feedEmptyState = (): IEmptyStateProps => ({
  title: 'Ничего не нашлось',
  description: 'Попробуйте изменить запрос или выбрать другую категорию.',
})

export const feedSearchField = (): ISearchFieldProps => ({
  value: '',
  onChange: noop,
})

export const feedProductGallery = (): IProductGalleryProps => ({
  images: [
    feedProductImageDto(true, 0),
    feedProductImageDto(false, 1),
    feedProductImageDto(false, 2),
  ],
  productName: faker.commerce.productName(),
})

export const feedBreadcrumbs = (): IBreadcrumbsProps => ({
  items: [
    { label: 'Главная', link: { href: '/' } },
    { label: 'Каталог', link: { href: '/catalog' } },
  ],
  current: faker.commerce.productName(),
})

export const feedProductGrid = (): IProductGridProps => ({
  products: [
    feedProduct(),
    feedProduct(),
    feedProduct({ inStock: false }),
    feedProduct({ images: [] }),
  ],
  buildHref: product => `/catalog/${product.slug}`,
})

export const feedProductDetails = (): IProductDetailsProps => ({
  product: feedProduct(),
  categoryName: 'Уход за кожей',
})

export const feedCatalogTemplate = (): ICatalogTemplateProps => ({
  title: 'Каталог',
  summary: 'Заявки принимаются до ближайшего дедлайна.',
  children: 'Сюда встаёт сетка товаров',
})

export const feedProductTemplate = (): IProductTemplateProps => ({
  children: 'Сюда встаёт карточка товара',
})

/* --- Авторизация --- */

export const feedAuthTemplate = (): IAuthTemplateProps => ({
  title: 'Вход',
  subtitle: 'Введите телефон и пароль — код придёт в Telegram.',
  children: 'Сюда встаёт форма',
})

export const feedLoginForm = (): ILoginFormProps => ({
  onSubmit: noop,
})

export const feedRegisterForm = (): IRegisterFormProps => ({
  onSubmit: noop,
})

export const feedOtpVerifyForm = (): IOtpVerifyFormProps => ({
  onSubmit: noop,
  hint: 'Код отправлен на +996 555 12 34 56',
})

export const feedTelegramLinkPrompt = (): ITelegramLinkPromptProps => ({
  botUsername: 'lulu_beauty_bot',
})

/* --- Корзина и оформление --- */

const HOUR_MS = 60 * 60 * 1000
const DEADLINE_HOURS = 30

/** Дедлайн через полтора дня — так видны и дни, и часы. */
const feedDeadline = (): string => new Date(Date.now() + DEADLINE_HOURS * HOUR_MS).toISOString()

export const feedCartItem = (quantity = 2): ICartItem => {
  const product = feedProduct()

  return {
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    productImageUrl: product.images[0]?.url ?? null,
    productPriceCents: product.priceCents,
    quantity,
    lineTotalCents: product.priceCents * quantity,
  }
}

export const feedCart = (): ICart => {
  const items = [feedCartItem(1), feedCartItem(3)]

  return {
    cycleId: faker.string.uuid(),
    cycleDeadlineAt: feedDeadline(),
    items,
    totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
  }
}

export const feedDeadlineCountdown = (): IDeadlineCountdownProps => ({
  deadlineAt: feedDeadline(),
})

export const feedQuantityStepper = (): IQuantityStepperProps => ({
  value: 2,
  onChange: noop,
})

export const feedCartItemRow = (): ICartItemRowProps => {
  const item = feedCartItem()

  return {
    item,
    href: `/catalog/${item.productSlug}`,
    onQuantityChange: noop,
    onRemove: noop,
  }
}

export const feedCartPanel = (): ICartPanelProps => ({
  cart: feedCart(),
  buildProductHref: slug => `/catalog/${slug}`,
  onQuantityChange: noop,
  onRemove: noop,
  onCheckout: noop,
})

export const feedCheckoutForm = (): ICheckoutFormProps => ({
  totalCents: 348_000,
  itemCount: 4,
  deadlineAt: feedDeadline(),
  onSubmit: noop,
})

export const feedCartTemplate = (): ICartTemplateProps => ({
  title: 'Корзина',
  summary: 'Заявка отправится владельцу после закрытия сбора.',
  children: 'Сюда встаёт список позиций',
})

/* --- Заявки покупателя и профиль --- */

const DAY_MS = 24 * HOUR_MS

export const feedOrderItem = (overrides: Partial<IOrderItem> = {}): IOrderItem => {
  const product = feedProduct()
  const quantity = faker.number.int({ min: 1, max: 3 })

  return {
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    productImageUrl: product.images[0]?.url ?? null,
    productPriceCents: product.priceCents,
    quantity,
    lineTotalCents: product.priceCents * quantity,
    ...overrides,
  }
}

export const feedOrder = (overrides: Partial<IOrder> = {}): IOrder => {
  const items = overrides.items ?? [feedOrderItem(), feedOrderItem()]

  return {
    id: faker.string.uuid(),
    cycleId: faker.string.uuid(),
    status: 'PENDING',
    totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    note: null,
    createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    items,
    ...overrides,
  }
}

export const feedAuthUser = (overrides: Partial<IAuthUser> = {}): IAuthUser => ({
  id: faker.string.uuid(),
  phone: '+996555123456',
  name: faker.person.firstName(),
  role: 'CUSTOMER',
  phoneVerified: true,
  telegramLinked: false,
  ...overrides,
})

export const feedOrderStatusBadge = (): IOrderStatusBadgeProps => ({
  status: 'CONFIRMED',
})

export const feedOrderItemRow = (): IOrderItemRowProps => {
  const item = feedOrderItem()

  return { item, href: `/catalog/${item.productSlug}` }
}

export const feedOrderCard = (): IOrderCardProps => {
  const order = feedOrder()

  return { order, href: `/orders/${order.id}` }
}

export const feedOrderList = (): IOrderListProps => ({
  orders: [
    feedOrder(),
    feedOrder({ status: 'CONFIRMED', createdAt: new Date(Date.now() - 5 * DAY_MS).toISOString() }),
    feedOrder({ status: 'COMPLETED', createdAt: new Date(Date.now() - 30 * DAY_MS).toISOString() }),
  ],
  buildHref: order => `/orders/${order.id}`,
})

export const feedOrderDetails = (): IOrderDetailsProps => ({
  order: feedOrder({ note: 'Позвоните после 18:00, пожалуйста.' }),
  buildProductHref: slug => `/catalog/${slug}`,
  isCurrentCycle: true,
})

export const feedProfileForm = (): IProfileFormProps => ({
  user: feedAuthUser(),
  onSubmit: noop,
})

export const feedAccountTemplate = (): IAccountTemplateProps => ({
  title: 'Мои заявки',
  summary: 'История ваших заявок по сборам.',
  navigation: [
    { label: 'Мои заявки', link: { href: '/orders' } },
    { label: 'Профиль', link: { href: '/account' } },
  ],
  currentHref: '/orders',
  children: 'Сюда встаёт содержимое раздела',
})
