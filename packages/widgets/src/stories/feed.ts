import faker from './faker'
import {
  IAccountTemplateProps,
  IAdminCategoriesPanelProps,
  IAdminCycleCalendarProps,
  IAdminImportPanelProps,
  IAdminLayoutProps,
  IAdminMessageDialogProps,
  IAdminOrder,
  IAdminOrderDiscountDialogProps,
  IAdminOrderCycle,
  IAdminOrderDialogProps,
  IAdminOrderEditDialogProps,
  ICustomerOption,
  ICustomerSelectProps,
  IAdminChecklistProps,
  IAdminChecklistExtraDialogProps,
  IAdminOrdersTableProps,
  IAdminProductFormProps,
  IAdminPromoCode,
  IAdminPromoCodeDialogProps,
  IAdminPromoCodeFormProps,
  IAdminPromoCodesTableProps,
  IFormSectionProps,
  IPromotionPeriodFieldsProps,
  IAdminPromotionFormProps,
  IAdminPromotionParticipantsDialogProps,
  IAdminPromotionsTableProps,
  IPromotion,
  IPromotionTarget,
  IPromotionCatalog,
  IPromotionConditionBuilderProps,
  IPromotionBannerFieldProps,
  IPromotionParticipant,
  IPromotionProductSearchProps,
  IPromotionRewardBuilderProps,
  IPromotionTargetFieldProps,
  IAdminProductGalleryProps,
  IAdminProductsTableProps,
  IAdminUser,
  IAdminUsersTableProps,
  IAlertProps,
  IAppearProps,
  IAuthTemplateProps,
  ILegalTemplateProps,
  IAuthUser,
  ICart,
  ICartGift,
  ICartItem,
  ICartPromotions,
  IGiftLineProps,
  IAdminBannerItem,
  IAdminBannersBoardProps,
  IAdminNewsBannerFormProps,
  IBannerSlide,
  IPromoCarouselProps,
  IPromotionDetailsProps,
  IPromoCode,
  IPromoCodeCardProps,
  IPromoCodeFieldProps,
  IPromotionLinesProps,
  IPublicPromotion,
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
  IBrandMarqueeProps,
  ICategoryTilesProps,
  IDecorFieldProps,
  IFaqAccordionProps,
  IHomeCtaProps,
  IHomeSectionProps,
  IFloatProps,
  IParallaxProps,
  IRevealProps,
  IStatusPanelProps,
  IStepSceneProps,
  IHomeHeroProps,
  IHomeTemplateProps,
  IHeaderProps,
  IHeaderSearchProps,
  IIconButtonProps,
  IActionMenuProps,
  IImage,
  IInputProps,
  IItemRowProps,
  ILink,
  IMobileMenuProps,
  IModalProps,
  IOrder,
  IOrderCardProps,
  IOrderCycle,
  IOrderDetailsProps,
  IOrderItem,
  IOrderListProps,
  IOrderStatusBadgeProps,
  IPaginationProps,
  IShowcaseMoreProps,
  IProfileFormProps,
  IPhoneInputProps,
  IWantedProductFormProps,
  IPortalProps,
  IPriceProps,
  IProduct,
  IProductCardProps,
  IProductDetailsProps,
  IVariantSelectorProps,
  IProductGalleryProps,
  IProductGridProps,
  IProductImage,
  IProductPickerProps,
  IProductTemplateProps,
  IQuantityStepperProps,
  IRichTextEditorProps,
  IRichTextProps,
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

/** Корзина без акций: общая константа, чтобы не тратить значения seeded faker. */
const EMPTY_PROMOTIONS: ICartPromotions = {
  applied: [],
  hints: [],
  gifts: [],
  itemsDiscountCents: 0,
  orderDiscountCents: 0,
  discountCents: 0,
  payableCents: 0,
}

export const feedButton = (): IButtonProps => ({
  children: 'Добавить в корзину',
  variant: 'primary',
  size: 'md',
})

export const feedIconButton = (): IIconButtonProps => ({
  icon: '✕',
  label: 'Удалить позицию',
})

export const feedActionMenu = (): IActionMenuProps => ({
  label: 'Действия «LETO2026»',
  items: [
    { label: 'Изменить', link: { href: '/admin/promo-codes/1' } },
    { label: 'Выключить', onSelect: noop },
    { label: 'Дублировать', link: { href: '/admin/promo-codes/add?from=1' } },
    { label: 'Использования', onSelect: noop },
    { label: 'В архив', tone: 'danger', onSelect: noop },
  ],
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

/**
 * Описание в том виде, в каком его пишет владелец: абзац, подзаголовок, список
 * и ссылка — весь набор, который умеет редактор, чтобы в Storybook было видно
 * каждый элемент.
 */
const RICH_DESCRIPTION =
  '<p>Лёгкий тонер с <strong>5% ниацинамида</strong> выравнивает тон и сужает поры. ' +
  'Подходит для <em>чувствительной</em> кожи.</p>' +
  '<h2>Как применять</h2>' +
  '<ol><li>Очистите кожу.</li><li>Нанесите тонер ватным диском.</li><li>Дайте впитаться.</li></ol>' +
  '<h2>Чем хорош</h2>' +
  '<ul><li>Без спирта и отдушек</li><li>Не липнет</li></ul>' +
  '<p>Состав - на <a href="https://example.com" rel="noopener noreferrer nofollow">сайте бренда</a>.</p>'

export const feedRichText = (): IRichTextProps => ({
  html: RICH_DESCRIPTION,
})

export const feedRichTextEditor = (): IRichTextEditorProps => ({
  value: RICH_DESCRIPTION,
  onChange: noop,
  label: 'Описание',
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
  hint: 'JPEG или PNG, до 15 МБ',
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
  logo: { label: 'Sululu', link: { href: '/' } },
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

export const feedHeaderSearch = (): IHeaderSearchProps => ({
  value: 'тон',
  onChange: noop,
  groups: [
    {
      title: 'Категории',
      items: [{ id: 'c-toners', label: 'Тонеры', link: { href: '/catalog?category=toners' } }],
    },
    {
      title: 'Бренды',
      items: [{ id: 'b-tonymoly', label: 'Tonymoly', link: { href: '/catalog?brand=Tonymoly' } }],
    },
    {
      title: 'Товары',
      items: [
        {
          id: 'p-1',
          label: 'Тонер с центеллой, 200 мл',
          hint: 'Round Lab',
          link: { href: '/catalog/toner-centella' },
          priceCents: 189000,
        },
        {
          id: 'p-2',
          label: 'Тонер-пэды с ниацинамидом',
          hint: 'Anua',
          link: { href: '/catalog/toner-pads' },
          priceCents: 245000,
          isUnavailable: true,
        },
      ],
    },
  ],
  allResults: {
    label: 'Показать всё по запросу «тон»',
    link: { href: '/catalog?q=%D1%82%D0%BE%D0%BD' },
  },
  contact: {
    label: 'Instagram',
    link: { href: 'https://www.instagram.com/sululu_kg', target: '_blank' },
  },
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
  copyright: '© 2026 Sululu',
  note: 'Оплата - переводом, чек отправляете боту. Доставка обсуждается лично',
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
      visual: 'cart',
    },
    {
      title: 'Оформите заявку',
      description: 'Это не оплата: заявка уходит нам, цены фиксируются на момент отправки.',
      visual: 'request',
    },
    {
      title: 'Дождитесь подтверждения',
      description: 'После закрытия сбора мы подтвердим заявку - уведомление придёт в Telegram.',
      visual: 'confirm',
    },
    {
      title: 'Получите товар',
      description: 'Когда заказ приедет, мы обсудим с вами доставку или самовывоз.',
      visual: 'handover',
    },
  ],
})

export const feedStepScene = (): IStepSceneProps => ({
  kind: 'cart',
})

export const feedStatusPanel = (): IStatusPanelProps => ({
  label: 'До закрытия сбора',
  isLive: true,
  children: '2 дн 14 час',
})

export const feedFloat = (): IFloatProps => ({
  children: 'Левитирую',
})

export const feedParallax = (): IParallaxProps => ({
  children: 'Еду медленнее скролла',
})

export const feedHomeHero = (): IHomeHeroProps => ({
  // Готовая разбивка на строки: маска выхода работает построчно.
  title: ['Косметика', 'по выгодным ценам'],
  description:
    'Заказываем общим объёмом и напрямую - поэтому и цены выгодные. Оплаты на сайте нет: вы оставляете заявку, а решение по ней присылает бот.',
  note: '214 товаров · 26 брендов',
})

export const feedHomeTemplate = (): IHomeTemplateProps => ({
  hero: 'Сюда встаёт первый экран',
  children: 'Сюда встают секции',
})

export const feedReveal = (): IRevealProps => ({
  children: 'Появляюсь по входу в вьюпорт',
})

export const feedHomeSection = (): IHomeSectionProps => ({
  children: 'Содержимое секции',
})

/**
 * `containerRef` в реальной странице указывает на секцию с прокруткой;
 * в стори и тесте хватает любого живого элемента — параллакс просто стоит.
 */
export const feedDecorField = (): IDecorFieldProps => ({
  spots: [
    {
      image: feedImage(320, 480),
      side: 'left',
      /* В стори хватает фиксированного отступа; страница задаёт `clamp()`. */
      offsetX: '48px',
      top: '38%',
      size: 'md',
      depth: 0.8,
    },
    {
      image: feedImage(320, 480),
      side: 'right',
      offsetX: '64px',
      top: '60%',
      size: 'sm',
      depth: 0.35,
      floatPhase: 0.6,
      isFlipped: true,
      isStrong: true,
      halo: 'accent',
    },
  ],
  containerRef: { current: typeof document === 'undefined' ? null : document.body },
})

export const feedCategoryTiles = (): ICategoryTilesProps => ({
  categories: [
    feedCategory('Уход за кожей'),
    feedCategory('Тонеры'),
    feedCategory('Сыворотки'),
    feedCategory('Солнцезащита'),
  ],
  buildHref: category => `/catalog?category=${category.slug}`,
})

export const feedBrandMarquee = (): IBrandMarqueeProps => ({
  brands: ['Anua', 'Celimax', 'Manyo', 'Medicube', 'Round Lab', 'Dr. Althea'],
  buildHref: brand => `/catalog?brand=${encodeURIComponent(brand)}`,
})

export const feedFaqAccordion = (): IFaqAccordionProps => ({
  items: [
    {
      question: 'Чем заявка отличается от заказа?',
      answer:
        'Заявка - это список того, что вы хотите взять в текущем сборе. Она уходит нам, а не в оплату.',
    },
    {
      question: 'Почему нельзя оплатить на сайте?',
      answer:
        'Онлайн-оплаты нет вовсе: мы подтверждаем заявки после закрытия сбора, и бот присылает реквизиты для перевода.',
    },
    {
      question: 'Сбора сейчас нет - что делать?',
      answer:
        'Каталог открыт всегда, но корзина работает только при открытом сборе - понравившееся сохраняйте в избранное.',
    },
    {
      question: 'Как связаться с магазином?',
      answer:
        'Через бота в Telegram - кнопка «✍️ Написать Sululu» в меню. Или напишите напрямую в {link}.',
      action: {
        label: 'Instagram магазина',
        link: { href: 'https://www.instagram.com/sululu_kg', target: '_blank' },
      },
    },
  ],
})

export const feedHomeCta = (): IHomeCtaProps => ({
  title: 'Вход и подтверждение - в Telegram',
  description: 'Бот заводит аккаунт, подтверждает вход, присылает счёт по заявке и принимает чек.',
  actions: 'Сюда встают кнопки',
  note: 'Оплата - переводом, чек отправляете боту. Доставка обсуждается лично',
})

/* --- Витрина --- */

const PRICE_MIN = 25_000
const PRICE_MAX = 450_000

/** Категория; с `parentId` — подкатегория этого раздела. */
export const feedCategory = (name?: string, parentId: string | null = null): ICategory => ({
  id: faker.string.uuid(),
  name: name ?? faker.commerce.department(),
  slug: faker.lorem.slug(2),
  sortOrder: faker.number.int({ min: 0, max: 10 }),
  parentId,
})

export const feedProductImageDto = (isPrimary = false, sortOrder = 0): IProductImage => ({
  id: faker.string.uuid(),
  url: faker.image.url({ width: 600, height: 750 }),
  alt: faker.commerce.productName(),
  sortOrder,
  isPrimary,
})

/**
 * Товар, продающийся в одном объёме, — таких в каталоге большинство.
 *
 * Вариант ровно один и согласован с `priceCents`/`volumeMl`/`inStock`: на
 * бэкенде эти три поля производные от вариантов, и фикстура, в которой они
 * расходятся, описывала бы состояние, которого не бывает.
 */
export const feedProduct = (overrides: Partial<IProduct> = {}): IProduct => {
  const priceCents = faker.number.int({ min: PRICE_MIN, max: PRICE_MAX })
  const volumeMl = faker.helpers.arrayElement([30, 50, 100, 150, 500])

  return {
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    slug: faker.lorem.slug(3),
    description: faker.commerce.productDescription(),
    descriptionHtml: null,
    brand: faker.company.name(),
    priceCents,
    volumeMl,
    categoryId: faker.string.uuid(),
    inStock: true,
    isFeatured: false,
    shadeLabel: 'TONE',
    images: [feedProductImageDto(true, 0), feedProductImageDto(false, 1)],
    variants: [{ id: faker.string.uuid(), volumeMl, priceCents, inStock: true }],
    deletedAt: null,
    createdAt: faker.date.past({ years: 1 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString(),
    ...overrides,
  }
}

/** Цена большего объёма против меньшего — чтобы переключатель не выглядел сломанным. */
const LARGER_PRICE_FACTOR = 1.6

/**
 * Товар в двух объёмах: 30 мл в наличии, 50 мл кончились.
 *
 * Именно эта пара и нужна витрине для проверки — «от» в цене, отсутствие
 * единого объёма у товара и отключённая кнопка в селекторе сразу на одном
 * экземпляре.
 */
export const feedProductWithVariants = (overrides: Partial<IProduct> = {}): IProduct => {
  const priceCents = faker.number.int({ min: PRICE_MIN, max: PRICE_MAX })

  return feedProduct({
    priceCents,
    // Объёмов два, поэтому одним числом товар не описать — как и на бэкенде.
    volumeMl: null,
    variants: [
      { id: faker.string.uuid(), volumeMl: 30, priceCents, inStock: true },
      {
        id: faker.string.uuid(),
        volumeMl: 50,
        priceCents: Math.round(priceCents * LARGER_PRICE_FACTOR),
        inStock: false,
      },
    ],
    ...overrides,
  })
}

/**
 * Тоналка в двух объёмах и трёх тонах: оси независимы, и у каждого тона есть
 * оба объёма. Цена — своя у объёма и одна у его тонов, как требует бэкенд.
 * Одного тона в 50 мл нет в наличии — чтобы погашенная кнопка была видна.
 */
export const feedProductWithShades = (overrides: Partial<IProduct> = {}): IProduct => {
  const priceCents = faker.number.int({ min: PRICE_MIN, max: PRICE_MAX })
  const shades = ['21 Light', '23 Beige', '25 Sand']
  const variants = [30, 50].flatMap(volumeMl =>
    shades.map(shade => ({
      id: faker.string.uuid(),
      volumeMl,
      shade,
      priceCents: volumeMl === 30 ? priceCents : Math.round(priceCents * LARGER_PRICE_FACTOR),
      inStock: !(volumeMl === 50 && shade === '25 Sand'),
    }))
  )

  return feedProduct({
    priceCents,
    volumeMl: null,
    variants,
    images: [
      feedProductImageDto(true, 0),
      { ...feedProductImageDto(false, 1), shades: ['23 Beige'] },
    ],
    ...overrides,
  })
}

export const feedProductCard = (): IProductCardProps => {
  const product = feedProduct()

  return { product, href: `/catalog/${product.slug}`, categoryName: 'Уход за кожей' }
}

export const feedShowcaseMore = (): IShowcaseMoreProps => ({
  label: 'Смотреть каталог',
  hint: '214 товаров',
  link: { href: '/catalog' },
})

export const feedPagination = (): IPaginationProps => ({
  page: 3,
  pageSize: 20,
  total: 147,
  onChange: noop,
})

export const feedCategoryFilter = (): ICategoryFilterProps => {
  const skincare = feedCategory('Уход за кожей')

  return {
    categories: [
      skincare,
      feedCategory('Макияж'),
      feedCategory('Волосы'),
      feedCategory('Парфюмерия'),
      feedCategory('Умывашки', skincare.id),
      feedCategory('Тонеры', skincare.id),
    ],
    selectedSlug: null,
    onSelect: noop,
  }
}

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

export const feedWantedProductForm = (): IWantedProductFormProps => ({
  isSignedIn: true,
  onSignIn: noop,
  contact: { label: 'Instagram', link: { href: '#', target: '_blank' } },
  onSubmit: noop,
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

export const feedVariantSelector = (): IVariantSelectorProps => {
  const { variants } = feedProductWithVariants()

  return { variants, selectedId: variants[0]?.id ?? null, onSelect: noop }
}

export const feedCatalogTemplate = (): ICatalogTemplateProps => ({
  title: 'Каталог',
  summary: 'Заявки принимаются до ближайшего дедлайна.',
  aside: 'Сюда встаёт таймер сбора',
  children: 'Сюда встаёт сетка товаров',
})

export const feedProductTemplate = (): IProductTemplateProps => ({
  children: 'Сюда встаёт карточка товара',
})

/* --- Авторизация --- */

export const feedAuthTemplate = (): IAuthTemplateProps => ({
  title: 'Вход',
  subtitle: 'Введите телефон и пароль - код придёт в Telegram.',
  children: 'Сюда встаёт форма',
})

export const feedLegalTemplate = (): ILegalTemplateProps => ({
  title: 'Политика обработки персональных данных',
  updatedAt: '2026-09-18',
  summary: 'Короткая выжимка того, что магазин сохраняет и зачем.',
  sections: [
    {
      title: 'Какие данные мы собираем',
      body: [
        'Только то, без чего нельзя принять заявку и сообщить о ней:',
        ['номер телефона', 'имя из профиля Telegram', 'идентификатор чата с ботом'],
      ],
    },
    {
      title: 'Как удалить аккаунт',
      body: ['Кнопка «Удалить аккаунт» в профиле стирает эти данные без обращения к нам.'],
    },
  ],
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
    variantId: product.variants[0]?.id ?? faker.string.uuid(),
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    productImageUrl: product.images[0]?.url ?? null,
    productPriceCents: product.priceCents,
    quantity,
    lineTotalCents: product.priceCents * quantity,
    productBrand: product.brand,
    productCategoryName: 'Тонеры',
    productVolumeMl: product.volumeMl,
  }
}

export const feedCart = (): ICart => {
  const items = [feedCartItem(1), feedCartItem(3)]

  return {
    cycleId: faker.string.uuid(),
    cycleDeadlineAt: feedDeadline(),
    items,
    totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    promotions: EMPTY_PROMOTIONS,
  }
}

export const feedDeadlineCountdown = (): IDeadlineCountdownProps => ({
  deadlineAt: feedDeadline(),
})

export const feedQuantityStepper = (): IQuantityStepperProps => ({
  value: 2,
  onChange: noop,
})

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
  summary: 'Заявка отправится нам после закрытия сбора.',
  children: 'Сюда встаёт список позиций',
})

/* --- Заявки покупателя и профиль --- */

const DAY_MS = 24 * HOUR_MS

const NO_DISCOUNT = {
  discountKind: null,
  discountValue: null,
  discountNote: null,
  discountCents: 0,
} as const

export const feedOrderItem = (overrides: Partial<IOrderItem> = {}): IOrderItem => {
  const product = feedProduct()
  const quantity = faker.number.int({ min: 1, max: 3 })

  return {
    id: faker.string.uuid(),
    productId: product.id,
    variantId: product.variants[0]?.id ?? null,
    productName: product.name,
    productSlug: product.slug,
    productImageUrl: product.images[0]?.url ?? null,
    productPriceCents: product.priceCents,
    quantity,
    lineTotalCents: product.priceCents * quantity,
    productBrand: product.brand,
    productCategoryName: 'Тонеры',
    productVolumeMl: product.volumeMl,
    ...NO_DISCOUNT,
    ...overrides,
  }
}

export const feedOrder = (overrides: Partial<IOrder> = {}): IOrder => {
  const items = overrides.items ?? [feedOrderItem(), feedOrderItem()]
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0)

  return {
    id: faker.string.uuid(),
    cycleId: faker.string.uuid(),
    status: 'PENDING',
    totalCents: subtotalCents - items.reduce((sum, item) => sum + item.discountCents, 0),
    subtotalCents,
    ...NO_DISCOUNT,
    note: null,
    createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    items,
    isEditable: true,
    isRestorable: false,
    isCancellable: true,
    pendingStage: 'COLLECTING',
    paidAt: null,
    revision: 1,
    promotions: [],
    gifts: [],
    promoItemsDiscountCents: 0,
    promoOrderDiscountCents: 0,
    promoCode: null,
    issuedPromoCodes: [],
    ...overrides,
  }
}

export const feedAuthUser = (overrides: Partial<IAuthUser> = {}): IAuthUser => ({
  id: faker.string.uuid(),
  phone: '+996555123456',
  name: faker.person.firstName(),
  role: 'CUSTOMER',
  telegramLinked: false,
  telegramUserId: null,
  deliveryAddress: 'Бишкек, ул. Киевская 10, кв. 5',
  deliveryNote: 'Доставка по городу, после 18:00',
  ...overrides,
})

export const feedOrderStatusBadge = (): IOrderStatusBadgeProps => ({
  status: 'CONFIRMED',
})

export const feedItemRow = (): IItemRowProps => {
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
  contactLink: { href: 'https://www.instagram.com/sululu_kg', target: '_blank' },
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

export const feedAdminMessageDialog = (): IAdminMessageDialogProps => ({
  isOpen: true,
  customerName: 'Айгуль',
  orderNumber: 'A1B2C3D4',
  value: 'Здравствуйте! Крем закончился у поставщика - заменить на соседний объём?',
  onChange: noop,
  maxLength: 3500,
  onSend: noop,
  onClose: noop,
})

export const feedCustomerOption = (overrides: Partial<ICustomerOption> = {}): ICustomerOption => ({
  id: faker.string.uuid(),
  name: faker.person.firstName(),
  phone: `+996${faker.string.numeric(9)}`,
  telegramLinked: true,
  ...overrides,
})

export const feedCustomerSelect = (): ICustomerSelectProps => ({
  value: null,
  onChange: noop,
  query: 'айг',
  onQueryChange: noop,
  results: [
    feedCustomerOption({ name: 'Айгуль', phone: '+996700123456' }),
    feedCustomerOption({ name: 'Айгерим', phone: '+996555987654', telegramLinked: false }),
  ],
})

export const feedAdminOrderCycle = (
  overrides: Partial<IAdminOrderCycle> = {}
): IAdminOrderCycle => ({
  id: faker.string.uuid(),
  label: 'Октябрь',
  deadlineAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
  closedAt: null,
  isOpen: true,
  customerOrderIds: [],
  ...overrides,
})

export const feedAdminOrderDialog = (): IAdminOrderDialogProps => {
  const cycles = [
    feedAdminOrderCycle(),
    feedAdminOrderCycle({
      label: 'Сентябрь',
      deadlineAt: new Date(Date.now() - DAY_MS).toISOString(),
      closedAt: new Date(Date.now() - DAY_MS).toISOString(),
      isOpen: false,
    }),
  ]

  return {
    isOpen: true,
    onClose: noop,
    customerSelect: {
      ...feedCustomerSelect(),
      value: feedCustomerOption({ name: 'Айгуль', phone: '+996700123456' }),
    },
    productSearch: { query: '', onQueryChange: noop, products: null },
    cycles,
    cycleId: cycles[0]?.id ?? null,
    onCycleChange: noop,
    lines: [
      {
        variantId: faker.string.uuid(),
        productName: 'Сыворотка Centella',
        productSlug: 'centella',
        productImageUrl: null,
        productBrand: 'Skin1004',
        productVolumeMl: 50,
        priceCents: 145_000,
        quantity: 2,
      },
    ],
    onAdd: noop,
    onQuantityChange: noop,
    onRemove: noop,
    note: '',
    onNoteChange: noop,
    buildProductHref: slug => `/catalog/${slug}`,
    onSubmit: noop,
  }
}

export const feedAdminOrderDiscountDialog = (): IAdminOrderDiscountDialogProps => ({
  isOpen: true,
  onClose: noop,
  order: feedAdminOrder({
    status: 'AWAITING_PAYMENT',
    customerName: 'Айгуль',
    items: [
      feedOrderItem({
        productName: 'Тонер Heartleaf',
        productPriceCents: 150_000,
        quantity: 2,
        lineTotalCents: 300_000,
      }),
      feedOrderItem({
        productName: 'Крем Centella',
        productPriceCents: 120_000,
        quantity: 1,
        lineTotalCents: 120_000,
      }),
    ],
    subtotalCents: 420_000,
    totalCents: 420_000,
  }),
  onSubmit: noop,
  onRemove: noop,
  onDraftChange: noop,
  // Ответ бэкенда на 10% со всей заявки: 4 200 сом − 420 сом.
  preview: { totalCents: 378_000, error: null, isPending: false },
})

export const feedAdminOrderEditDialog = (): IAdminOrderEditDialogProps => {
  const order = feedAdminOrder({ status: 'AWAITING_PAYMENT', customerName: 'Айгуль' })

  return {
    isOpen: true,
    onClose: noop,
    order,
    productSearch: { query: '', onQueryChange: noop, products: null },
    lines: [
      ...order.items.map(item => ({
        key: item.id,
        itemId: item.id,
        variantId: item.variantId,
        productName: item.productName,
        productSlug: item.productSlug,
        productImageUrl: item.productImageUrl,
        productBrand: item.productBrand,
        productVolumeMl: item.productVolumeMl,
        priceCents: item.productPriceCents,
        quantity: item.quantity,
      })),
      {
        key: 'new-line',
        itemId: null,
        variantId: faker.string.uuid(),
        productName: 'Сыворотка Centella',
        productSlug: 'centella',
        productImageUrl: null,
        productBrand: 'Skin1004',
        productVolumeMl: 50,
        priceCents: 145_000,
        quantity: 1,
      },
    ],
    onAdd: noop,
    onQuantityChange: noop,
    onRemove: noop,
    hasChanges: true,
    buildProductHref: slug => `/catalog/${slug}`,
    onSubmit: noop,
  }
}

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

/** Уведомление с обратным ходом — то, что показывается после удаления. */
export const feedToastWithAction = (): IToastProps => ({
  toast: {
    id: 'toast-2',
    tone: 'warning',
    title: 'Товар убран из корзины',
    subject: 'Крем для рук',
    action: { label: 'Вернуть', onAction: noop },
  },
  onDismiss: noop,
})

/**
 * Длинное название: обрезается на второй строке только оно — событие в
 * заголовке и пояснение видны целиком, ширина тоста не зависит от товара.
 */
export const feedToastOverflowing = (): IToastProps => ({
  toast: {
    id: 'toast-3',
    tone: 'warning',
    title: 'Товар убран из заявки',
    subject:
      'Увлажняющая сыворотка с гиалуроновой кислотой, ниацинамидом и экстрактом центеллы азиатской, 30 мл',
    description: 'Пока сбор открыт, её можно вернуть - состав и цены пересчитаются сами.',
    action: { label: 'Вернуть', onAction: noop },
  },
  onDismiss: noop,
})

export const feedToastViewport = (): IToastViewportProps => ({
  toasts: [
    { id: 'toast-1', tone: 'success', title: 'Товар сохранён' },
    { id: 'toast-2', tone: 'info', title: 'Фотография загружена', description: 'Стала главной.' },
    {
      id: 'toast-3',
      tone: 'danger',
      title: 'Не удалось удалить сбор',
      description: 'В нём есть заявки.',
    },
    {
      id: 'toast-4',
      tone: 'warning',
      title: 'Товар убран из корзины',
      subject: 'Крем для рук',
      action: { label: 'Вернуть', onAction: noop },
    },
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
  hint: 'До 10 МБ. Первая строка - заголовки колонок.',
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

/** Три раздела, у первого — две подкатегории (они в конце списка, как их отдаёт бэкенд по `sortOrder`). */
const feedCategorySet = (): ICategory[] => {
  const skincare = feedCategory('Уход за кожей')

  return [
    skincare,
    feedCategory('Макияж'),
    feedCategory('Волосы'),
    feedCategory('Умывашки', skincare.id),
    feedCategory('Тонеры', skincare.id),
  ]
}

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
    sort: { field: 'created', direction: 'desc' },
    onSortChange: noop,
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
    images: product.images,
    onImagesUpload: noop,
    onImageDelete: noop,
    onImagesArrange: noop,
  }
}

/** Помада в двух объёмах и трёх тонах: общие фото, фото тонов, палетка и скрытое. */
export const feedAdminProductGallery = (): IAdminProductGalleryProps => {
  const variants = [30, 50].flatMap(volumeMl =>
    ['01 Nude', '05 Rose', '12 Berry'].map(shade => ({ volumeMl, shade }))
  )
  const images: IProductImage[] = [
    feedProductImageDto(true, 0),
    { ...feedProductImageDto(false, 1), shades: ['05 Rose'] },
    { ...feedProductImageDto(false, 2), shades: ['05 Rose'], volumesMl: [50] },
    { ...feedProductImageDto(false, 3), shades: ['01 Nude', '12 Berry'] },
    { ...feedProductImageDto(false, 4), hidden: true },
  ]

  return {
    images,
    variants,
    productName: 'Помада Velvet',
    onChange: noop,
    onAdd: noop,
    onDelete: noop,
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
  onExport: noop,
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
  customerDeliveryAddress: 'Бишкек, ул. Киевская 10, кв. 5',
  customerDeliveryNote: 'Самовывоз',
  hasReceipt: false,
  canMessage: true,
  createdById: null,
  createdByName: null,
  ...overrides,
})

export const feedAdminUser = (overrides: Partial<IAdminUser> = {}): IAdminUser => ({
  ...feedAuthUser(),
  createdAt: new Date(Date.now() - DAY_MS).toISOString(),
  telegramLinked: true,
  ...overrides,
})

export const feedAdminUsersTable = (): IAdminUsersTableProps => ({
  users: [
    feedAdminUser({ name: 'Айгуль', role: 'SUPER_ADMIN' }),
    feedAdminUser({ name: 'Бакыт', phone: '+996555222333', role: 'ADMIN' }),
    feedAdminUser({ name: 'Чолпон', phone: '+996555444555' }),
  ],
  // Витрина — глазами super admin: только у него в этой таблице есть кнопки.
  canManageRoles: true,
  onRoleChange: noop,
})

export const feedAdminChecklist = (): IAdminChecklistProps => ({
  customGifts: [
    { title: 'Mystery box', imageUrl: null, quantity: 3 },
    { title: 'Набор миниатюр', imageUrl: null, quantity: 1 },
  ],
  items: [
    ...[
      {
        productName: 'Гидрофильное масло Pure Cleansing',
        volumeMl: 200,
        brand: 'Anua',
        quantity: 4,
        unitPriceCents: 145_000,
      },
      {
        productName: 'Тонер Heartleaf 77',
        volumeMl: 250,
        brand: 'Anua',
        quantity: 2,
        unitPriceCents: 165_000,
      },
      {
        productName: 'Сыворотка Centella Ampoule',
        volumeMl: 55,
        brand: 'Skin1004',
        quantity: 7,
        unitPriceCents: 120_000,
      },
      {
        productName: 'Сыворотка Centella Ampoule',
        volumeMl: 100,
        brand: 'Skin1004',
        quantity: 1,
        unitPriceCents: 189_000,
      },
      {
        productName: 'Патчи для глаз',
        volumeMl: null,
        brand: '-',
        quantity: 3,
        unitPriceCents: 60_050,
      },
    ].map((item, index) => ({
      ...item,
      // Последний товар из каталога удалён насовсем: название без ссылки.
      productSlug: index === 4 ? null : `product-${index}`,
      key: `${item.productName}|${item.volumeMl}|${item.unitPriceCents}`,
    })),
    // Пункт, добавленный владельцем вручную: без бренда, объёма и ссылки, цена 0.
    {
      productName: 'Пакеты для выдачи',
      volumeMl: null,
      brand: '-',
      quantity: 20,
      unitPriceCents: 0,
      productSlug: null,
      extraId: 'extra-1',
      key: 'extra|extra-1',
    },
  ],
  checkedKeys: ['Тонер Heartleaf 77|250|165000'],
  onToggle: noop,
  onRemoveExtra: noop,
  buildProductHref: slug => `/catalog/${slug}`,
})

export const feedAdminChecklistExtraDialog = (): IAdminChecklistExtraDialogProps => ({
  isOpen: true,
  onSubmit: noop,
  onClose: noop,
})

export const feedAdminOrdersTable = (): IAdminOrdersTableProps => ({
  orders: [
    feedAdminOrder({ note: 'Позвоните после 18:00.' }),
    feedAdminOrder({ status: 'AWAITING_PAYMENT', hasReceipt: true }),
    feedAdminOrder({ createdById: faker.string.uuid(), createdByName: 'Мария' }),
    feedAdminOrder({
      status: 'COMPLETED',
      paidAt: new Date(Date.now() - DAY_MS).toISOString(),
    }),
    feedAdminOrder({
      status: 'AWAITING_PAYMENT',
      subtotalCents: 300_000,
      totalCents: 270_000,
      items: [feedOrderItem({ productPriceCents: 150_000, quantity: 2, lineTotalCents: 300_000 })],
      discountKind: 'PERCENT',
      discountValue: 10,
      discountNote: 'Постоянный клиент',
      discountCents: 30_000,
      promotions: [
        {
          id: faker.string.uuid(),
          promotionId: faker.string.uuid(),
          promoCodeId: null,
          title: 'Весенняя распродажа',
          discountCents: 15_000,
        },
      ],
      gifts: [
        {
          id: faker.string.uuid(),
          orderPromotionId: faker.string.uuid(),
          kind: 'CUSTOM',
          title: 'Mystery box',
          imageUrl: null,
          productId: null,
          variantId: null,
          quantity: 1,
        },
      ],
      issuedPromoCodes: [
        {
          id: faker.string.uuid(),
          code: 'K7M2QX9P',
          status: 'ACTIVE',
          conditions: [],
          rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null }],
          validFrom: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
        },
      ],
    }),
  ],
  onStatusChange: noop,
  onMessage: noop,
  onDiscount: noop,
  buildProductHref: slug => `/catalog/${slug}`,
  summary: { orderCount: 42, itemCount: 118, totalCents: 18_450_000 },
})

/* --- Акции и промокоды (админка) --- */

const feedTarget = (overrides: Partial<IPromotionTarget> = {}): IPromotionTarget => ({
  productIds: [],
  categoryIds: [],
  brands: [],
  ...overrides,
})

export const feedPromotion = (overrides: Partial<IPromotion> = {}): IPromotion => ({
  id: faker.string.uuid(),
  slug: 'spring-sale',
  title: 'Весенняя распродажа',
  descriptionHtml: '<p>Скидка на уход и подарок к заявке от 3000 сом.</p>',
  bannerMobileUrl: faker.image.url({ width: 1080, height: 720 }),
  bannerDesktopUrl: null,
  startsAt: new Date(Date.now() - DAY_MS).toISOString(),
  endsAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
  isEnabled: true,
  announce: false,
  announcedAt: null,
  sortOrder: 0,
  conditions: [{ type: 'SUBTOTAL', minCents: 300_000, target: null }],
  rewards: [
    { type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null },
    {
      type: 'GIFT',
      gift: 'CUSTOM',
      title: 'Mystery box',
      imageUrl: null,
      variantId: null,
      quantity: 1,
    },
  ],
  status: 'ACTIVE',
  participantsCount: 12,
  showInCarousel: true,
  deletedAt: null,
  createdAt: new Date(Date.now() - 5 * DAY_MS).toISOString(),
  updatedAt: new Date(Date.now() - DAY_MS).toISOString(),
  ...overrides,
})

export const feedAdminPromotionsTable = (): IAdminPromotionsTableProps => ({
  promotions: [
    feedPromotion(),
    feedPromotion({
      title: 'Подарок за три товара бренда Anua и вторая очень длинная часть названия акции',
      slug: 'anua-gift',
      status: 'SCHEDULED',
      isEnabled: true,
      participantsCount: 0,
      startsAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
      conditions: [{ type: 'QUANTITY', minQuantity: 3, target: feedTarget({ brands: ['Anua'] }) }],
      rewards: [
        {
          type: 'PROMO_CODE',
          validDays: 30,
          validFrom: null,
          validUntil: null,
          conditions: [],
          rewards: [{ type: 'DISCOUNT', kind: 'AMOUNT', value: 50_000, target: null }],
        },
      ],
    }),
    feedPromotion({ title: 'Осенний сбор', slug: 'autumn', status: 'DISABLED', isEnabled: false }),
    feedPromotion({
      title: 'Прошлогодняя акция',
      slug: 'old',
      status: 'ARCHIVED',
      deletedAt: new Date().toISOString(),
    }),
  ],
  buildEditHref: promotion => `/admin/promotions/${promotion.id}`,
  buildDuplicateHref: promotion => `/admin/promotions/add?from=${promotion.id}`,
  onToggleEnabled: noop,
  onShowParticipants: noop,
  onDelete: noop,
})

export const feedPromotionCatalog = (): IPromotionCatalog => ({
  categories: feedCategorySet(),
  brands: ['Anua', 'COSRX', 'Laneige', 'Round Lab'],
  // Первый результат - `p-1`, уже выбранный в `feedPromotionTargetField`: в истории видна пометка «Выбран».
  searchProducts: async query => [
    feedProduct({ id: 'p-1', name: `Сыворотка ${query}` }),
    feedProduct({ name: `Тонер ${query}` }),
  ],
  labels: {},
  onLabel: noop,
  uploadGiftImage: async () => faker.image.url({ width: 400, height: 400 }),
})

export const feedAdminPromotionForm = (): IAdminPromotionFormProps => ({
  catalog: feedPromotionCatalog(),
  initialValues: feedPromotion(),
  savedBanners: { mobile: feedPromotion().bannerMobileUrl, desktop: null },
  onBannerUpload: noop,
  onBannerRemove: noop,
  onSubmit: noop,
})

export const feedFormSection = (): IFormSectionProps => ({
  title: 'Основное',
  summary: 'Весенняя распродажа',
  isOpen: true,
  onToggle: noop,
  children: 'Поля секции',
})

export const feedPromotionPeriodFields = (): IPromotionPeriodFieldsProps => ({
  startDate: '2026-12-01',
  startTime: '00:00',
  endDate: '2026-12-31',
  endTime: '23:59',
  isOpenEnded: false,
  errors: { start: null, end: null },
  onChange: noop,
  onOpenEndedChange: noop,
})

export const feedAdminPromoCode = (overrides: Partial<IAdminPromoCode> = {}): IAdminPromoCode => ({
  id: faker.string.uuid(),
  code: 'LETO2026',
  title: 'Скидка 10% на летнюю заявку',
  descriptionHtml: '<p>Для постоянных покупателей.</p>',
  startsAt: new Date(Date.now() - DAY_MS).toISOString(),
  endsAt: null,
  isEnabled: true,
  assignedUser: null,
  conditions: [{ type: 'SUBTOTAL', minCents: 200_000, target: null }],
  rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null }],
  status: 'ACTIVE',
  participantsCount: 4,
  deletedAt: null,
  createdAt: new Date(Date.now() - 5 * DAY_MS).toISOString(),
  updatedAt: new Date(Date.now() - DAY_MS).toISOString(),
  ...overrides,
})

export const feedAdminPromoCodesTable = (): IAdminPromoCodesTableProps => ({
  promoCodes: [
    feedAdminPromoCode(),
    feedAdminPromoCode({
      code: 'K7M2XQ9R',
      title: 'Персональная скидка для Айгуль',
      endsAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
      assignedUser: {
        ...feedCustomerOption({ name: 'Айгуль', phone: '+996700123456' }),
        isDeleted: false,
      },
      participantsCount: 1,
      rewards: [
        {
          type: 'GIFT',
          gift: 'CUSTOM',
          title: 'Mystery box',
          imageUrl: null,
          variantId: null,
          quantity: 1,
        },
      ],
    }),
    feedAdminPromoCode({
      code: 'ZIMA2026',
      title: 'Зимняя акция (выключен)',
      isEnabled: false,
      status: 'DISABLED',
      participantsCount: 0,
    }),
  ],
  buildEditHref: promoCode => `/admin/promo-codes/${promoCode.id}`,
  buildDuplicateHref: promoCode => `/admin/promo-codes/add?from=${promoCode.id}`,
  onCopy: noop,
  onToggleEnabled: noop,
  onShowParticipants: noop,
  onDelete: noop,
})

export const feedAdminPromoCodeForm = (): IAdminPromoCodeFormProps => ({
  catalog: feedPromotionCatalog(),
  customerSelect: {
    query: '',
    onQueryChange: noop,
    results: [
      feedCustomerOption({ name: 'Айгуль', phone: '+996700123456' }),
      feedCustomerOption({ name: 'Айгерим', phone: '+996555987654', telegramLinked: false }),
    ],
  },
  onSubmit: noop,
})

export const feedAdminPromoCodeDialog = (): IAdminPromoCodeDialogProps => ({
  isOpen: true,
  onClose: noop,
  onSave: noop,
  catalog: feedPromotionCatalog(),
  value: {
    validity: 'DAYS',
    validDays: '30',
    validFromDate: '',
    validUntilDate: '',
    conditions: [],
    rewards: [],
  },
})

export const feedAdminPromotionParticipantsDialog = (): IAdminPromotionParticipantsDialogProps => {
  const participants: IPromotionParticipant[] = [
    {
      orderPromotionId: faker.string.uuid(),
      orderId: faker.string.uuid(),
      userId: faker.string.uuid(),
      userName: 'Айгуль',
      orderStatus: 'CONFIRMED',
      orderTotalCents: 270_000,
      rewards: feedPromotion().rewards,
      releasedAt: null,
      createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    },
    {
      orderPromotionId: faker.string.uuid(),
      orderId: faker.string.uuid(),
      userId: faker.string.uuid(),
      userName: 'Нурзат',
      orderStatus: 'CANCELLED_BY_CUSTOMER',
      orderTotalCents: 150_000,
      rewards: feedPromotion().rewards,
      releasedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
    },
  ]

  return {
    isOpen: true,
    onClose: noop,
    promotionTitle: 'Весенняя распродажа',
    participants,
    page: 1,
    pageSize: 20,
    total: 46,
    onPageChange: noop,
    buildOrderHref: orderId => `/admin/orders?order=${orderId}`,
  }
}

export const feedPromotionTargetField = (): IPromotionTargetFieldProps => {
  const catalog = feedPromotionCatalog()

  return {
    catalog: { ...catalog, labels: { 'p-1': 'Сыворотка Centella' } },
    value: feedTarget({
      productIds: ['p-1'],
      categoryIds: catalog.categories.slice(0, 1).map(category => category.id),
      brands: ['Anua'],
    }),
    onChange: noop,
  }
}

export const feedPromotionConditionBuilder = (): IPromotionConditionBuilderProps => ({
  catalog: feedPromotionCatalog(),
  value: [
    {
      key: 'c-1',
      type: 'SUBTOTAL',
      amount: '3000',
      quantity: '',
      mode: 'ANY',
      hasTarget: false,
      target: feedTarget(),
    },
    {
      key: 'c-2',
      type: 'CONTAINS',
      amount: '',
      quantity: '',
      mode: 'ANY',
      hasTarget: true,
      target: feedTarget({ brands: ['Anua'] }),
    },
  ],
  onChange: noop,
})

export const feedPromotionRewardBuilder = (): IPromotionRewardBuilderProps => ({
  catalog: feedPromotionCatalog(),
  value: [
    {
      key: 'r-1',
      type: 'DISCOUNT',
      kind: 'PERCENT',
      value: '10',
      hasTarget: false,
      target: feedTarget(),
      gift: 'CUSTOM',
      giftTitle: 'Mystery box',
      giftImageUrl: null,
      giftVariantId: null,
      giftQuantity: '1',
      promoCode: null,
    },
    {
      key: 'r-2',
      type: 'GIFT',
      kind: 'PERCENT',
      value: '',
      hasTarget: false,
      target: feedTarget(),
      gift: 'CUSTOM',
      giftTitle: 'Mystery box',
      giftImageUrl: null,
      giftVariantId: null,
      giftQuantity: '1',
      promoCode: null,
    },
  ],
  onChange: noop,
  onEditPromoCode: noop,
})

export const feedPromotionProductSearch = (): IPromotionProductSearchProps => ({
  searchProducts: feedPromotionCatalog().searchProducts,
  onPick: noop,
})

export const feedPromotionBannerField = (): IPromotionBannerFieldProps => ({
  variant: 'mobile',
  url: faker.image.url({ width: 1080, height: 720 }),
  isRequired: true,
  onSelect: noop,
  onRemove: noop,
})

/* --- Акции и промокоды: витрина --- */

/**
 * Баннер как data-URI: сторис не должны зависеть от сети, и пропорции видны сразу.
 * Размеры - `BANNER_SPECS`: мобильный 1080x720, десктопный 1920x640.
 */
const bannerImage = (label: string, width: number, height: number, hue: number): string => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},70%,86%)"/><stop offset="1" stop-color="hsl(${hue + 40},65%,70%)"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" ` +
    `font-weight="700" font-size="${Math.round(height / 7)}" fill="#442131">${label}</text></svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const feedPublicPromotion = (
  overrides: Partial<IPublicPromotion> = {}
): IPublicPromotion => ({
  id: 'promo-spring',
  slug: 'spring-sale',
  title: 'Весенняя распродажа',
  descriptionHtml: '<p>Скидка 10% на заявку от 3000 сом и подарок - Mystery box.</p>',
  bannerMobileUrl: bannerImage('Весенняя распродажа - 1080x720', 1080, 720, 320),
  bannerDesktopUrl: bannerImage('Весенняя распродажа - 1920x640', 1920, 640, 320),
  startsAt: new Date(Date.now() - DAY_MS).toISOString(),
  endsAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
  conditions: [{ type: 'SUBTOTAL', minCents: 300_000, target: null }],
  rewards: [
    { type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null },
    {
      type: 'GIFT',
      gift: 'CUSTOM',
      title: 'Mystery box',
      imageUrl: null,
      variantId: null,
      quantity: 1,
    },
  ],
  products: [],
  categories: [],
  ...overrides,
})

/** Акционный слайд: как его собирает сайт из `GET /banners`. */
export const feedBannerSlide = (overrides: Partial<IBannerSlide> = {}): IBannerSlide => ({
  key: 'promotion:promo-spring',
  kind: 'PROMOTION',
  title: 'Весенняя распродажа',
  text: null,
  imageMobileUrl: bannerImage('Весенняя распродажа - 1080x720', 1080, 720, 320),
  imageDesktopUrl: bannerImage('Весенняя распродажа - 1920x640', 1920, 640, 320),
  href: '/promotions/spring-sale',
  isExternal: false,
  ctaLabel: null,
  ...overrides,
})

/** Текстовая новость без картинки: карточка из заголовка, текста и кнопки. */
export const feedNewsTextSlide = (overrides: Partial<IBannerSlide> = {}): IBannerSlide =>
  feedBannerSlide({
    key: 'news:news-cycle',
    kind: 'NEWS',
    title: 'Новый сбор открыт',
    text: 'Принимаем заявки до пятницы - успейте собрать любимое к весне.',
    imageMobileUrl: null,
    imageDesktopUrl: null,
    href: '/catalog',
    ctaLabel: 'В каталог',
    ...overrides,
  })

export const feedBannerSlides = (): IBannerSlide[] => [
  feedBannerSlide(),
  // Только мобильный баннер: на широком экране он кадрируется под 3:1.
  feedBannerSlide({
    key: 'promotion:promo-box',
    title: 'Mystery box в подарок',
    imageMobileUrl: bannerImage('Mystery box - 1080x720', 1080, 720, 20),
    imageDesktopUrl: null,
    href: '/promotions/mystery-box',
  }),
  feedNewsTextSlide(),
  // Новость с картинкой и внешней ссылкой.
  feedBannerSlide({
    key: 'news:news-channel',
    kind: 'NEWS',
    title: 'Мы в Telegram',
    imageMobileUrl: bannerImage('Telegram - 1080x720', 1080, 720, 200),
    imageDesktopUrl: bannerImage('Telegram - 1920x640', 1920, 640, 200),
    href: 'https://t.me/sululu',
    isExternal: true,
  }),
]

export const feedPromoCarousel = (): IPromoCarouselProps => ({
  slides: feedBannerSlides(),
})

/** Строка списка баннеров; по умолчанию - идущая акция с баннером. */
export const feedAdminBannerItem = (
  overrides: Partial<IAdminBannerItem> = {}
): IAdminBannerItem => ({
  key: 'promotion:promo-spring',
  id: 'promo-spring',
  kind: 'PROMOTION',
  state: 'SHOWN',
  isShown: true,
  position: 0,
  slide: {
    key: 'promotion:promo-spring',
    kind: 'PROMOTION',
    title: 'Весенняя распродажа',
    text: null,
    imageMobileUrl: bannerImage('Весенняя распродажа - 1080x720', 1080, 720, 320),
    imageDesktopUrl: null,
    promotionSlug: 'spring-sale',
    linkUrl: null,
    ctaLabel: null,
  },
  promotionId: 'promo-spring',
  promotionStatus: 'ACTIVE',
  startsAt: new Date(Date.now() - DAY_MS).toISOString(),
  endsAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
  news: null,
  createdAt: new Date(Date.now() - 5 * DAY_MS).toISOString(),
  ...overrides,
})

export const feedAdminBannersBoard = (): IAdminBannersBoardProps => ({
  items: feedAdminBannerItems(),
  buildPromotionHref: item => `/admin/promotions/${item.id}`,
  buildNewsEditHref: item => `/admin/banners/news/${item.id}`,
  onToggleShown: () => {},
  onReorder: () => {},
  onDeleteNews: () => {},
})

/** Форма сохранённой новости: текстовый слайд со ссылкой, без картинок. */
export const feedAdminNewsBannerForm = (): IAdminNewsBannerFormProps => ({
  initialValues: {
    title: 'Новый сбор открыт',
    text: 'Принимаем заявки до пятницы - успейте собрать любимое к весне.',
    linkUrl: '/catalog',
    ctaLabel: 'В каталог',
    imageMobileUrl: null,
    imageDesktopUrl: null,
    startsAt: null,
    endsAt: null,
    isEnabled: true,
  },
  savedImages: { mobile: null, desktop: null },
  onImageUpload: () => {},
  onImageRemove: () => {},
  onSubmit: () => {},
})

const feedNewsItem = (
  id: string,
  overrides: Partial<IAdminBannerItem> = {},
  news: Partial<NonNullable<IAdminBannerItem['news']>> = {}
): IAdminBannerItem => {
  const fields = {
    title: 'Новый сбор открыт',
    text: 'Принимаем заявки до пятницы',
    linkUrl: '/catalog',
    ctaLabel: 'В каталог',
    imageMobileUrl: null,
    imageDesktopUrl: null,
    startsAt: null,
    endsAt: null,
    isEnabled: true,
    ...news,
  }

  return feedAdminBannerItem({
    key: `news:${id}`,
    id,
    kind: 'NEWS',
    isShown: fields.isEnabled,
    slide: {
      key: `news:${id}`,
      kind: 'NEWS',
      title: fields.title,
      text: fields.text,
      imageMobileUrl: fields.imageMobileUrl,
      imageDesktopUrl: fields.imageDesktopUrl,
      promotionSlug: null,
      linkUrl: fields.linkUrl,
      ctaLabel: fields.ctaLabel,
    },
    promotionId: null,
    promotionStatus: null,
    startsAt: fields.startsAt,
    endsAt: fields.endsAt,
    news: fields,
    ...overrides,
  })
}

/** Смешанный список: показанные, скрытые, завершённые, без баннера, выключенная акция. */
export const feedAdminBannerItems = (): IAdminBannerItem[] => [
  feedNewsItem('news-cycle', { position: 0 }),
  feedAdminBannerItem({ position: 1 }),
  feedAdminBannerItem({
    key: 'promotion:promo-box',
    id: 'promo-box',
    promotionId: 'promo-box',
    state: 'HIDDEN',
    isShown: false,
    position: 2,
    slide: {
      ...feedAdminBannerItem().slide,
      key: 'promotion:promo-box',
      title: 'Mystery box в подарок',
      promotionSlug: 'mystery-box',
    },
  }),
  feedAdminBannerItem({
    key: 'promotion:promo-plain',
    id: 'promo-plain',
    promotionId: 'promo-plain',
    state: 'NO_IMAGE',
    position: 3,
    slide: {
      ...feedAdminBannerItem().slide,
      key: 'promotion:promo-plain',
      title: 'Скидка без баннера',
      imageMobileUrl: null,
      promotionSlug: 'plain',
    },
  }),
  feedAdminBannerItem({
    key: 'promotion:promo-off',
    id: 'promo-off',
    promotionId: 'promo-off',
    state: 'PROMOTION_OFF',
    promotionStatus: 'DISABLED',
    position: 4,
    slide: {
      ...feedAdminBannerItem().slide,
      key: 'promotion:promo-off',
      title: 'Выключенная акция',
      promotionSlug: 'off',
    },
  }),
  feedNewsItem(
    'news-old',
    { state: 'FINISHED', position: 5 },
    {
      title: 'Прошлый сбор закрыт',
      text: null,
      linkUrl: null,
      ctaLabel: null,
      endsAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
    }
  ),
  feedNewsItem(
    'news-later',
    { state: 'SCHEDULED', position: 6 },
    {
      title: 'Скоро: новое поступление',
      startsAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    }
  ),
]

export const feedCartGift = (overrides: Partial<ICartGift> = {}): ICartGift => ({
  kind: 'CUSTOM',
  title: 'Mystery box',
  imageUrl: null,
  productId: null,
  variantId: null,
  quantity: 1,
  ...overrides,
})

export const feedGiftLine = (): IGiftLineProps => ({
  gift: feedCartGift(),
  note: 'Акция «Весенняя распродажа»',
})

/** Корзина, на которую действует акция со скидкой и подарком и ещё одна не добрана. */
export const feedCartPromotions = (totalCents: number): ICartPromotions => {
  const discountCents = Math.round(totalCents / 10)
  const gift = feedCartGift()

  return {
    applied: [
      {
        promotionId: 'promo-spring',
        slug: 'spring-sale',
        title: 'Весенняя распродажа',
        discountCents,
        gifts: [gift],
      },
    ],
    hints: [
      {
        promotionId: 'promo-big',
        slug: 'big-order',
        title: 'Подарок за большую заявку',
        missingCents: 120_000,
        missingQuantity: 0,
      },
    ],
    gifts: [gift],
    itemsDiscountCents: 0,
    orderDiscountCents: discountCents,
    discountCents,
    payableCents: totalCents - discountCents,
  }
}

export const feedCartWithPromotions = (): ICart => {
  const cart = feedCart()

  return { ...cart, promotions: feedCartPromotions(cart.totalCents) }
}

export const feedCartPanelWithPromotions = (): ICartPanelProps => ({
  ...feedCartPanel(),
  cart: feedCartWithPromotions(),
  buildPromotionHref: slug => `/promotions/${slug}`,
})

export const feedPromotionLines = (): IPromotionLinesProps => ({
  promotions: feedCartPromotions(500_000),
  kind: 'discounts',
  buildPromotionHref: slug => `/promotions/${slug}`,
})

export const feedPromoCode = (overrides: Partial<IPromoCode> = {}): IPromoCode => ({
  id: 'code-1',
  code: 'K7M2XQ9R',
  status: 'ACTIVE',
  conditions: [{ type: 'SUBTOTAL', minCents: 200_000, target: null }],
  rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 15, target: null }],
  validFrom: new Date(Date.now() - DAY_MS).toISOString(),
  expiresAt: new Date(Date.now() + 20 * DAY_MS).toISOString(),
  promotionTitle: 'Весенняя распродажа',
  isOwnerCode: false,
  descriptionHtml: null,
  sourceOrderId: 'order-1',
  usedOrderId: null,
  createdAt: new Date(Date.now() - DAY_MS).toISOString(),
  ...overrides,
})

export const feedPromoCodeCard = (): IPromoCodeCardProps => ({
  code: feedPromoCode(),
  onCopy: noop,
  buildOrderHref: id => `/orders/${id}`,
})

export const feedPromoCodeField = (): IPromoCodeFieldProps => ({
  value: '',
  onChange: noop,
  onApply: noop,
  applied: null,
  onRemove: noop,
  options: [
    { code: 'K7M2XQ9R', label: 'Скидка 15% · от 2 000 сом' },
    { code: 'P4TN8W3B', label: 'Подарок: Mystery box' },
  ],
  onPickOption: noop,
  allCodesHref: '/promocodes',
})

export const feedCheckoutFormWithPromotions = (): ICheckoutFormProps => ({
  ...feedCheckoutForm(),
  promotions: feedCartPromotions(348_000),
  buildPromotionHref: slug => `/promotions/${slug}`,
})

/** Заявка, в которой сработали акция со скидкой и подарком, держится код и выдан новый. */
export const feedOrderWithPromotions = (): IOrder => {
  const order = feedOrder()
  const discountCents = Math.round(order.subtotalCents / 10)

  return {
    ...order,
    totalCents: order.subtotalCents - discountCents - 20_000,
    promoOrderDiscountCents: discountCents + 20_000,
    promotions: [
      {
        id: 'op-1',
        promotionId: 'promo-spring',
        promoCodeId: null,
        title: 'Весенняя распродажа',
        discountCents,
      },
      {
        id: 'op-2',
        promotionId: null,
        promoCodeId: 'code-1',
        title: 'Промокод K7M2XQ9R',
        discountCents: 20_000,
      },
    ],
    gifts: [
      {
        id: 'gift-1',
        orderPromotionId: 'op-1',
        kind: 'CUSTOM',
        title: 'Mystery box',
        imageUrl: null,
        productId: null,
        variantId: null,
        quantity: 1,
      },
    ],
    promoCode: {
      id: 'code-1',
      code: 'K7M2XQ9R',
      status: 'RESERVED',
      conditions: [],
      rewards: [{ type: 'DISCOUNT', kind: 'AMOUNT', value: 20_000, target: null }],
      validFrom: new Date(Date.now() - DAY_MS).toISOString(),
      expiresAt: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    },
    issuedPromoCodes: [
      {
        id: 'code-2',
        code: 'P4TN8W3B',
        status: 'ACTIVE',
        conditions: [{ type: 'SUBTOTAL', minCents: 200_000, target: null }],
        rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 15, target: null }],
        validFrom: new Date(Date.now() - DAY_MS).toISOString(),
        expiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      },
    ],
  }
}

export const feedCheckoutPanelWithPromotions = (): Omit<ICheckoutPanelProps, 'form'> => ({
  ...feedCheckoutPanel(),
  cart: feedCartWithPromotions(),
  code: { code: 'K7M2XQ9R', gifts: [feedCartGift({ title: 'Миниатюра сыворотки, 5 мл' })] },
})

export const feedPromotionDetails = (): IPromotionDetailsProps => ({
  promotion: feedPublicPromotion(),
  catalogHref: '/catalog',
})
