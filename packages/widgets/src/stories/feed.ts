import faker from './faker'
import {
  IAccountTemplateProps,
  IAdminCategoriesPanelProps,
  IAdminCycleCalendarProps,
  IAdminImportPanelProps,
  IAdminLayoutProps,
  IAdminOrder,
  IAdminOrdersTableProps,
  IAdminProductFormProps,
  IAdminProductsTableProps,
  IAdminUser,
  IAdminUsersTableProps,
  IAlertProps,
  IAppearProps,
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
  ICheckoutPanelProps,
  ICheckboxProps,
  IChipProps,
  IComboboxProps,
  IConfirmDialogProps,
  IContainerProps,
  IDeadlineCountdownProps,
  IDividerProps,
  IEmptyStateProps,
  IErrorTemplateProps,
  IFileDropzoneProps,
  IFileInputProps,
  IFooterProps,
  IHeadingProps,
  IHomeHeroProps,
  IHomeTemplateProps,
  IHeaderProps,
  IIconButtonProps,
  IImage,
  IInputProps,
  ILink,
  IMobileMenuProps,
  IModalProps,
  IOrder,
  IOrderCardProps,
  IOrderCycle,
  IOrderDetailsProps,
  IOrderItem,
  IOrderItemRowProps,
  IOrderListProps,
  IOrderStatusBadgeProps,
  IPaginationProps,
  IProfileFormProps,
  IPhoneInputProps,
  IPortalProps,
  IPriceProps,
  IProduct,
  IProductCardProps,
  IProductDetailsProps,
  IProductGalleryProps,
  IProductGridProps,
  IProductImage,
  IProductPickerProps,
  IProductTemplateProps,
  IQuantityStepperProps,
  ISearchFieldProps,
  ISectionHeadingProps,
  ISelectProps,
  ISkeletonProps,
  ISpinnerProps,
  IStatusSelectProps,
  IStepListProps,
  ISwitchProps,
  ITelegramLinkPromptProps,
  ITelegramLoginPanelProps,
  ITextProps,
  ITextareaProps,
  IToastProps,
  IToastViewportProps,
  ITooltipProps,
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

export const feedPhoneInput = (): IPhoneInputProps => ({
  value: '',
  onChange: noop,
  label: 'Телефон',
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

/** Бренды — тот самый случай, ради которого поле и появилось. */
export const feedCombobox = (): IComboboxProps => ({
  value: '',
  onChange: noop,
  label: 'Производитель',
  placeholder: 'Начните вводить название',
  hint: 'Выберите из уже заведённых или впишите новый.',
  options: ['COSRX', 'Laneige', 'Medi-Peel', 'Round Lab', 'Some By Mi'],
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

export const feedTooltip = (): ITooltipProps => ({
  content: 'Сейчас нет открытого сбора',
  children: 'Наведите на меня',
})

export const feedAppear = (): IAppearProps => ({
  children: 'Содержимое, вставшее на место скелетона',
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

export const feedMobileMenu = (): IMobileMenuProps => ({
  isOpen: true,
  onClose: noop,
  navigation: [
    { label: 'Каталог', link: { href: '/catalog' } },
    { label: 'Мои заявки', link: { href: '/orders' } },
  ],
  user: { name: 'Айгуль', link: { href: '/account' } },
  loginLink: { href: '/login' },
  registerLink: { href: '/register' },
  cartLink: { href: '/cart' },
  cartCount: 3,
  currentHref: '/catalog',
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

export const feedErrorTemplate = (): IErrorTemplateProps => ({
  code: '404',
  title: 'Страница не найдена',
  description: 'Возможно, ссылка устарела или товар убрали из каталога.',
})

/* --- Главная --- */

export const feedSectionHeading = (): ISectionHeadingProps => ({
  eyebrow: 'Свежая подборка',
  title: 'Что разбирают в этом сборе',
  description: 'Состав каталога меняется перед каждым сбором.',
})

export const feedStepList = (): IStepListProps => ({
  steps: [
    {
      title: 'Соберите корзину',
      description: 'Каталог открыт всегда, а оформить заявку можно, пока идёт сбор.',
    },
    {
      title: 'Оформите заявку',
      description: 'Это не оплата: заявка уходит владельцу, цены фиксируются на момент отправки.',
    },
    {
      title: 'Дождитесь подтверждения',
      description: 'После закрытия сбора владелец подтвердит заявку — уведомление придёт в Telegram.',
    },
    {
      title: 'Получите товар',
      description: 'Когда заказ приедет, владелец обсудит с вами доставку или самовывоз.',
    },
  ],
})

export const feedHomeHero = (): IHomeHeroProps => ({
  eyebrow: 'Сбор открыт',
  title: 'Косметика и уход — заказом на всех',
  description:
    'Мы собираем общий заказ к дедлайну: чем больше набирается, тем выгоднее выходит доставка.',
})

export const feedHomeTemplate = (): IHomeTemplateProps => ({
  hero: 'Сюда встаёт первый экран',
  children: 'Сюда встают секции',
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
  brand: faker.company.name(),
  priceCents: faker.number.int({ min: PRICE_MIN, max: PRICE_MAX }),
  volumeMl: faker.helpers.arrayElement([30, 50, 100, 150, 500]),
  categoryId: faker.string.uuid(),
  inStock: true,
  images: [feedProductImageDto(true, 0), feedProductImageDto(false, 1)],
  deletedAt: null,
  ...overrides,
})

export const feedProductCard = (): IProductCardProps => {
  const product = feedProduct()

  return { product, href: `/catalog/${product.slug}`, categoryName: 'Уход за кожей' }
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

/**
 * Длинный список с длинными названиями: на нём видно и перенос подписи в
 * столбце, и прокрутку боковой колонки админки.
 */
export const feedCategoryFilterMany = (): ICategoryFilterProps => ({
  categories: [
    feedCategory('Уход за кожей лица'),
    feedCategory('Уход за волосами и кожей головы'),
    feedCategory('Декоративная косметика'),
    feedCategory('Парфюмерия'),
    feedCategory('Уход за телом'),
    feedCategory('Маникюр и педикюр'),
    feedCategory('Солнцезащитные средства'),
    feedCategory('Наборы и подарочные боксы'),
    feedCategory('Аксессуары и кисти'),
    feedCategory('Мужская линейка'),
    feedCategory('Детская косметика'),
    feedCategory('Профессиональные средства для салонов'),
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

export const feedProductGrid = (): IProductGridProps => {
  const category = feedCategory('Уход за кожей')
  const products = [
    feedProduct({ categoryId: category.id }),
    feedProduct({ categoryId: category.id }),
    feedProduct({ categoryId: category.id, inStock: false }),
    feedProduct({ categoryId: category.id, images: [] }),
  ]

  return {
    products,
    buildHref: product => `/catalog/${product.slug}`,
    categoryNames: { [category.id]: category.name },
  }
}

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

export const feedTelegramLoginPanel = (): ITelegramLoginPanelProps => ({
  botUrl: 'https://t.me/lulu_beauty_test_bot?start=demo-payload',
  status: 'preparing',
  onRetry: noop,
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

/*
  Без `form`: форму оформления подставляет сам вызывающий — фикстура живёт в
  `.ts` и JSX собрать не может.
*/
export const feedCheckoutPanel = (): Omit<ICheckoutPanelProps, 'form'> => ({
  cart: feedCart(),
  buildProductHref: slug => `/catalog/${slug}`,
  cartHref: '/cart',
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
    id: faker.string.uuid(),
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
    isEditable: true,
    isRestorable: false,
    ...overrides,
  }
}

export const feedAuthUser = (overrides: Partial<IAuthUser> = {}): IAuthUser => ({
  id: faker.string.uuid(),
  phone: '+996555123456',
  name: faker.person.firstName(),
  role: 'CUSTOMER',
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

export const feedProductPicker = (): IProductPickerProps => ({
  query: 'сыв',
  onQueryChange: noop,
  products: [feedProduct(), feedProduct(), feedProduct({ inStock: false })],
  onAdd: noop,
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

/* --- Модальный слой, подтверждения, уведомления --- */

export const feedModal = (): IModalProps => ({
  isOpen: true,
  onClose: noop,
  title: 'Удалить товар?',
  children: 'Товар пропадёт из каталога, но останется в уже оформленных заявках.',
})

export const feedConfirmDialog = (): IConfirmDialogProps => ({
  isOpen: true,
  title: 'Удалить категорию?',
  description: 'Товары этой категории останутся в каталоге, но потеряют её.',
  onConfirm: noop,
  onCancel: noop,
})

export const feedToast = (): IToastProps => ({
  toast: {
    id: 'toast-1',
    tone: 'success',
    title: 'Товар сохранён',
    description: 'Изменения уже видны в каталоге.',
  },
  onDismiss: noop,
})

export const feedToastViewport = (): IToastViewportProps => ({
  toasts: [
    { id: 'toast-1', tone: 'success', title: 'Товар сохранён' },
    { id: 'toast-2', tone: 'info', title: 'Фотография загружена', description: 'Стала главной.' },
    { id: 'toast-3', tone: 'danger', title: 'Не удалось удалить сбор', description: 'В нём есть заявки.' },
  ],
  onDismiss: noop,
})

/* --- Загрузка файлов и статусы --- */

const MB = 1024 * 1024

export const feedFileDropzone = (): IFileDropzoneProps => ({
  onSelect: noop,
  label: 'Файл xlsx или csv',
  accept: '.xlsx,.csv',
  allowedExtensions: ['.xlsx', '.csv'],
  maxBytes: 10 * MB,
  hint: 'До 10 МБ. Первая строка — заголовки колонок.',
})

export const feedStatusSelect = (): IStatusSelectProps => ({
  value: 'PENDING',
  onChange: noop,
})

/* --- Админка --- */

export const feedAdminLayout = (): IAdminLayoutProps => ({
  title: 'Товары',
  summary: 'Каталог, категории и фотографии.',
  navigation: [
    { label: 'Обзор', link: { href: '/admin' } },
    { label: 'Товары', link: { href: '/admin/products' } },
    { label: 'Категории', link: { href: '/admin/categories' } },
    { label: 'Заявки', link: { href: '/admin/orders' } },
  ],
  currentHref: '/admin/products',
  children: 'Сюда встаёт содержимое раздела',
})

const feedCategorySet = (): ICategory[] => [
  feedCategory('Уход за кожей'),
  feedCategory('Макияж'),
  feedCategory('Волосы'),
]

export const feedAdminProductsTable = (): IAdminProductsTableProps => {
  const categories = feedCategorySet()
  const products = [
    feedProduct({ categoryId: categories[0].id }),
    feedProduct({ categoryId: categories[1].id, inStock: false }),
    feedProduct({
      categoryId: null,
      images: [],
      deletedAt: new Date(Date.now() - DAY_MS).toISOString(),
    }),
  ]

  return {
    products,
    categoryNames: Object.fromEntries(categories.map(category => [category.id, category.name])),
    buildEditHref: product => `/admin/products/${product.id}`,
    onDelete: noop,
    onRestore: noop,
  }
}

export const feedAdminProductForm = (): IAdminProductFormProps => {
  const categories = feedCategorySet()
  const product = feedProduct({ categoryId: categories[0].id })

  return {
    categories,
    brands: ['COSRX', 'Laneige', 'Medi-Peel', 'Round Lab', 'Some By Mi'],
    product,
    onSubmit: noop,
    // У товара фотография одна — админка показывает ровно её.
    images: product.images.slice(0, 1),
    onImageUpload: noop,
    onImageDelete: noop,
  }
}

export const feedAdminCategoriesPanel = (): IAdminCategoriesPanelProps => ({
  categories: feedCategorySet(),
  onCreate: noop,
  onUpdate: noop,
  onDelete: noop,
})

export const feedAdminImportPanel = (): IAdminImportPanelProps => ({
  onImport: noop,
  summary: {
    created: 12,
    updated: 3,
    errors: [
      { row: 4, message: "invalid price: 'дорого'" },
      { row: 9, message: "unknown category slug: 'parfum'" },
    ],
  },
})

/** Даты фиксированы относительно «сейчас», чтобы сбор всегда попадал в текущий месяц. */
export const feedAdminCycleCalendar = (): IAdminCycleCalendarProps => {
  const now = new Date()
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const active: IOrderCycle = {
    id: faker.string.uuid(),
    deadlineAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    label: 'Сбор на август',
    status: 'ACTIVE',
    reminderSentAt: null,
    finalReminderSentAt: null,
    closedAt: null,
  }

  return {
    cycles: [
      active,
      {
        id: faker.string.uuid(),
        deadlineAt: new Date(Date.now() + 20 * DAY_MS).toISOString(),
        label: 'Следующий сбор',
        status: 'UPCOMING',
        reminderSentAt: null,
        finalReminderSentAt: null,
        closedAt: null,
      },
    ],
    month,
    onMonthChange: noop,
    onCreate: noop,
    onUpdate: noop,
    onDelete: noop,
    activeCycleId: active.id,
  }
}

export const feedAdminOrder = (overrides: Partial<IAdminOrder> = {}): IAdminOrder => ({
  ...feedOrder(),
  customerName: faker.person.fullName(),
  customerPhone: '+996555123456',
  ...overrides,
})

export const feedAdminUser = (overrides: Partial<IAdminUser> = {}): IAdminUser => ({
  ...feedAuthUser(),
  createdAt: new Date(Date.now() - DAY_MS).toISOString(),
  telegramLinked: true,
  ...overrides,
})

export const feedAdminUsersTable = (): IAdminUsersTableProps => {
  const owner = feedAdminUser({ name: 'Айгуль', role: 'ADMIN' })

  return {
    users: [
      owner,
      feedAdminUser({ name: 'Бакыт', phone: '+996555222333' }),
      feedAdminUser({ name: 'Чолпон', phone: '+996555444555' }),
    ],
    currentUserId: owner.id,
    onRoleChange: noop,
  }
}

export const feedAdminOrdersTable = (): IAdminOrdersTableProps => ({
  orders: [
    feedAdminOrder({ note: 'Позвоните после 18:00.' }),
    feedAdminOrder({ status: 'CONFIRMED' }),
    feedAdminOrder({ status: 'COMPLETED' }),
  ],
  onStatusChange: noop,
  buildProductHref: slug => `/catalog/${slug}`,
})
