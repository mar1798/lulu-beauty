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
   * Вписать картинку в родителя (`object-fit: contain`) вместо собственных
   * размеров. Родитель обязан быть `position: relative` с заданной высотой
   * или `aspect-ratio`.
   *
   * Именно `contain`: в этом режиме здесь всегда фотография товара, а её
   * пропорции — не наша забота (что прислали, то и показываем). `cover`
   * обрезал высокие флаконы и растягивал широкие коробки.
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

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'READY'
  | 'COMPLETED'
  /** Покупатель передумал сам (`POST /orders/{id}/cancel`). */
  | 'CANCELLED_BY_CUSTOMER'
  /** Владелец отменил — руками или сняв с продажи последний товар заявки. */
  | 'CANCELLED_BY_OWNER'
export type CycleStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED'
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
  brand: string | null
  priceCents: number
  /** Объём в миллилитрах; `null` — у товара его нет (патчи, тканевые маски). */
  volumeMl: number | null
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
 * То, что нужно карточке позиции (`ItemRow`), чтобы себя нарисовать.
 *
 * Общий знаменатель корзины и заявки: строка у них одна и та же, и различаются
 * они не тем, как позиция выглядит, а тем, чем она адресуется — товаром в
 * корзине и собственным `id` в заявке.
 */
export interface IItemRowItem {
  productName: string
  productImageUrl: string | null
  productPriceCents: number
  quantity: number
  lineTotalCents: number
  /**
   * Метки товара — марка, категория, объём. Читаются из живого каталога, а не
   * из снапшота позиции, поэтому у позиции удалённого товара все три `null`.
   */
  productBrand: string | null
  productCategoryName: string | null
  productVolumeMl: number | null
}

/**
 * Позиция корзины. Своего `id` у неё нет: и `PATCH`, и `DELETE`
 * в `/cart/items/{productId}` адресуются идентификатором товара.
 */
export interface ICartItem extends IItemRowItem {
  productId: string
  productSlug: string
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
 * Позиция избранного — целый товар, а не снимок полей, как в корзине.
 *
 * Обещания она не фиксирует: ни цены, ни количества, — а рисуется той же
 * карточкой каталога, которой нужен `IProduct` целиком.
 */
export interface IWishlistItem {
  product: IProduct
  addedAt: string
}

/** Избранное целиком: от сбора не зависит и живёт между сборами. */
export interface IWishlist {
  items: IWishlistItem[]
}

/**
 * Позиция заявки — снапшот на момент чекаута, а не текущее состояние товара.
 * `productId` — `null`, если товар с тех пор удалён.
 */
export interface IOrderItem extends IItemRowItem {
  /** Идентификатор строки заявки: правка и удаление адресуются им, а не товаром. */
  id: string
  productId: string | null
  productSlug: string
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
   * Обратная сторона того же дедлайна: заявка отменена (любой из двух), но сбор
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
  /** Напоминание за сутки до дедлайна. */
  reminderSentAt: string | null
  /** Последнее напоминание, за несколько часов до дедлайна. */
  finalReminderSentAt: string | null
  closedAt: string | null
}

/**
 * Текущий пользователь. Подтверждённости телефона тут нет и не может быть:
 * аккаунт заводит бот из контакта, за который ручается сам Telegram, — то есть
 * неподтверждённым он не бывает (`apps/api/app/auth/models.py`).
 */
export interface IAuthUser {
  id: string
  phone: string
  name: string
  role: Role
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
  /**
   * Растянуть на всю ширину контейнера. `'mobile'` — только до `sm`: на
   * телефоне главное действие экрана обязано быть во всю ширину, а на
   * планшете и дальше кнопка по содержимому смотрится аккуратнее.
   */
  isFullWidth?: boolean | 'mobile'
  iconStart?: ReactNode
  iconEnd?: ReactNode
  /** Ссылочный режим: кнопка рендерится через `AppLink`, сохраняя внешность. */
  link?: ILink
  onClick?: () => void
  /**
   * Действие недоступно, и почему — текстом.
   *
   * Отличается от `disabled` тем, что кнопка **остаётся в табуляции**:
   * настоящий `disabled` не отдаёт ни `focus`, ни `mouseenter`, и подсказка
   * над ним не всплыла бы ни с клавиатуры, ни (в части браузеров) мышью —
   * причина оказалась бы недостижимой ровно там, где она нужна. Клик при этом
   * не проходит, а сама причина уходит в скрытую подпись, поэтому скринридер
   * читает её вместе с названием кнопки.
   */
  unavailableReason?: string | null
}

export interface IIconButtonProps {
  icon: ReactNode
  /** Обязателен: иконка без подписи для скринридера пуста. */
  label: string
  variant?: 'ghost' | 'solid' | 'danger' | 'dangerSoft' | 'primary'
  size?: IControlSize
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  /** Запрос в работе: иконка меняется на спиннер, кнопка блокируется. */
  isLoading?: boolean
  /** Ссылочный режим — см. `IButtonProps['link']`. */
  link?: ILink
  onClick?: () => void
  /** Недоступно с объяснением — см. `IButtonProps['unavailableReason']`. */
  unavailableReason?: string | null
}

export interface ITooltipProps {
  /** Текст пузыря. Он же обязан попадать в доступное имя триггера. */
  content: ReactNode
  /** Триггер: подсказка всплывает на его наведении и фокусе. */
  children: ReactNode
  placement?: 'top' | 'bottom'
  /**
   * Обёртка занимает всю ширину. Нужна кнопке с `isFullWidth`: обёртка по
   * умолчанию `inline-flex` и ужала бы её до содержимого.
   */
  isBlock?: boolean
}

export interface IInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  label?: string
  /** Имя поля для скринридера, когда видимой подписи нет. Игнорируется при `label`. */
  ariaLabel?: string
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

/** Префикс занят кодом страны, тип — `tel`. */
export interface IPhoneInputProps
  extends Omit<IInputProps, 'type' | 'prefix' | 'suffix' | 'inputMode' | 'autoComplete'> {
  /** Код страны без `+`. Значение наружу всегда уходит в E.164. */
  dialCode?: string
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

/**
 * Поле со свободным вводом и подсказками из уже введённых значений.
 *
 * В отличие от `ISelectProps` значение не обязано быть одним из `options`:
 * список только подсказывает, а не ограничивает.
 */
export interface IComboboxProps {
  value: string
  onChange: (value: string) => void
  /**
   * Подсказки. Совпадение ищется без учёта регистра, и им же значение
   * приводится к уже известному написанию: набранное «round lab» при
   * подсказке «Round Lab» — это она и есть, а не новое значение.
   */
  options: string[]
  id?: string
  name?: string
  label?: string
  /** Имя поля для скринридера, когда видимой подписи нет. Игнорируется при `label`. */
  ariaLabel?: string
  hint?: string
  error?: string | null
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  required?: boolean
  /** Подпись, когда под набранное ничего не нашлось. */
  emptyLabel?: string
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
  /**
   * Растянуть на всю ширину и разрешить перенос подписи. Для узкой колонки:
   * обычный чип не переносится (`white-space: nowrap`) и длинное название
   * вылезает за её край.
   */
  isBlock?: boolean
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
  /**
   * Режим «поверх героя» (главная): шапка лежит fixed поверх контента и
   * стартует без фона и границы, а после прокрутки на высоту шапки
   * возвращает обычный вид. Остальные страницы режим не включают.
   */
  isFloating?: boolean
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
  /**
   * Какую мини-сцену (`StepScene`) рисовать над текстом. Не задано —
   * карточка остаётся текстовой, как раньше.
   */
  visual?: IStepSceneKind
}

export interface IStepListProps {
  steps: IStep[]
}

export interface IHomeHeroProps {
  /**
   * Заголовок. Массив — готовая разбивка на строки: маска выхода работает
   * построчно, и автоматический перенос строк для неё непригоден.
   */
  title: string | string[]
  description?: string
  /** Кнопки: «в каталог», «мои заявки». Слот — адреса знает страница. */
  actions?: ReactNode
  /**
   * Таймер до дедлайна или сообщение, что открытого сбора нет.
   * Отдельным слотом, потому что сбор — данные сайта, а не шаблона.
   */
  aside?: ReactNode
  /**
   * Слот под `DecorField`: встаёт первым ребёнком в `position: absolute;
   * inset: 0`, за содержимым.
   */
  background?: ReactNode
  /** Подпись индикатора прокрутки. Не задана — индикатора нет. */
  scrollHint?: string
}

/**
 * Ступень шкалы `decor.size*`. Свободных ширин у пятна нет: процент ширины
 * секции — ровно то, из-за чего товар резался на десктопе.
 */
export type IDecorSize = 'sm' | 'md' | 'lg'

/** Одно фоновое декоративное пятно `DecorField`. */
export interface IDecorSpot {
  image: IImage
  /** К какому краю секции прижато пятно. Центра нет: там контент. */
  side: 'left' | 'right'
  /**
   * Отступ от своего края секции. CSS-длина, обычно `clamp()`. На `md` и
   * выше значение обязано быть ≥ 0 — иначе товар обрежется; за край
   * разрешено уходить только ореолу.
   */
  offsetX: string
  /** Положение ЦЕНТРА пятна в процентах высоты секции. Допустимо 32–68 %. */
  top: string
  size: IDecorSize
  /** 0 — стоит на месте, 1 — уезжает на всю амплитуду скролл-параллакса. */
  depth: number
  /** Фаза левитации 0…1: соседние пятна не должны качаться синхронно. */
  floatPhase?: number
  /** Отзеркалить по горизонтали: одна и та же баночка не должна повторяться дважды. */
  isFlipped?: boolean
  /** Ярче обычного — там, где над пятном нет текста. */
  isStrong?: boolean
  /** Пастельный ореол под баночкой. По умолчанию `'brand'`. */
  halo?: 'brand' | 'accent' | 'none'
  /**
   * Грузить сразу, без ленивой загрузки, и предзагрузить ссылкой в `<head>`.
   *
   * Нужен ровно одному пятну на странице — верхнему в герое. Оно попадает в
   * первый экран и оказывается самым большим отрисованным элементом (крупнее
   * заголовка), то есть именно оно определяет LCP. Ленивым его браузер
   * находит только после раскладки — лишний круг «раскладка → обнаружение →
   * запрос» на медленной сети.
   *
   * Остальным пятнам флаг ставить нельзя: они за пределами первого экрана, а
   * приоритетная загрузка отбирает канал у того самого пятна, ради которого
   * всё и затевалось.
   */
  isPriority?: boolean
}

export interface IDecorFieldProps {
  spots: IDecorSpot[]
  /** Ссылка на прокручиваемую секцию — вход в `useScroll({ target })`. */
  containerRef: React.RefObject<HTMLElement | null>
}

export interface IHomeSectionProps {
  children: ReactNode
  /** Слот под `DecorField`. Рендерится за содержимым. */
  background?: ReactNode
  /** Фон секции: холст, мягкая марочная заливка, чернильная. */
  tone?: 'plain' | 'soft' | 'ink'
  /**
   * Вертикальный ритм. `default` — `space.huge`/`giant`, `compact` —
   * `space.xxl`/`xxxl`. Компактной идёт секция-оглавление ассортимента.
   */
  density?: 'default' | 'compact'
  /** Своя ссылка на секцию — её же отдают в `DecorField.containerRef`. */
  sectionRef?: React.RefObject<HTMLElement | null>
  id?: string
}

export interface ICategoryTilesProps {
  categories: ICategory[]
  /** Адрес плитки. Страница строит `/catalog?category=<slug>`. */
  buildHref: (category: ICategory) => string
}

export interface IBrandMarqueeProps {
  brands: string[]
  /** Страница строит `/catalog?brand=<name>` — каталог такой параметр читает. */
  buildHref: (brand: string) => string
  /** Полный оборот ленты. По умолчанию рассчитывается от числа брендов. */
  durationSeconds?: number
}

export interface IFaqItem {
  question: string
  answer: string
}

export interface IFaqAccordionProps {
  items: IFaqItem[]
  /** Разрешить несколько открытых сразу. По умолчанию `false`. */
  isMultiple?: boolean
  /** Индекс раскрытого при первой отрисовке. По умолчанию ни одного. */
  defaultOpenIndex?: number
}

/**
 * Финальный блок-якорь главной. Имя намеренно не `TelegramCta`: виджет ничего
 * не знает ни про Telegram, ни про адрес бота — кнопки приходят слотом,
 * иначе презентационная библиотека знала бы про конкретный внешний сервис.
 */
export interface IHomeCtaProps {
  eyebrow?: string
  title: string
  description?: string
  /** Кнопки. Адрес бота знает страница. */
  actions: ReactNode
  /** Мелкая приписка под кнопками. */
  note?: string
  /** Слот под `DecorField`. */
  background?: ReactNode
}

export interface IParallaxProps {
  children: ReactNode
  /** Амплитуда в px: элемент едет от `+strength` к `−strength` за проход секции. */
  strength?: number
  axis?: 'x' | 'y'
  /** Секция-цель. Не задана — прогресс считается по собственной обёртке. */
  containerRef?: React.RefObject<HTMLElement | null>
  as?: 'div' | 'span'
}

/**
 * Вид мини-сцены шага: товар в корзину, корзина в заявку, решение в чате,
 * товар получен. Сцена — рисунок из токенов, а не превью настоящих данных.
 */
export type IStepSceneKind = 'cart' | 'request' | 'confirm' | 'handover'

export interface IStepSceneProps {
  kind: IStepSceneKind
  /**
   * Базовая задержка лесенки, с — та же ступень, что у `Reveal` своего шага:
   * части сцены не должны входить раньше собственной карточки.
   */
  delay?: number
}

/**
 * Карточка состояния сбора в герое. Панель не знает ни про сбор, ни про
 * таймер — метка, живая точка и место под содержимое, поэтому ею же
 * рисуется состояние «сбора нет».
 */
export interface IStatusPanelProps {
  /** Метка над содержимым: «До закрытия сбора» / «Сбор закрыт». */
  label: string
  /** Пульсирующая точка у метки: что-то происходит прямо сейчас. */
  isLive?: boolean
  tone?: 'brand' | 'muted' | 'urgent'
  children: ReactNode
}

export interface IRevealProps {
  children: ReactNode
  /** Тег обёртки: секции нужен div, элементу списка — li. */
  as?: 'div' | 'li' | 'span'
  /**
   * Задержка в секундах. Лесенка внутри списка собирается ею же —
   * `delay={staggerDelay(index)}` на каждом элементе.
   */
  delay?: number
  /** Доля видимости, при которой запускается (`viewport.amount`). */
  amount?: number
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
  /** Название категории: у товара приходит только `categoryId`. */
  categoryName?: string | null
  sizes?: ISizes
  /** Слот под «в корзину»: внутрь ссылки-карточки кнопку класть нельзя. */
  action?: ReactNode
  /**
   * Слот в правом верхнем углу фотографии — «в избранное».
   *
   * Отдельно от `action`: сердце должно быть на месте и тогда, когда «в
   * корзину» недоступна (сбор закрыт), а в строке с ценой две круглые кнопки
   * на узкой колонке встают вплотную.
   */
  mediaAction?: ReactNode
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
  /** Подпись строки-сброса. По умолчанию «Все категории». */
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
  /** Название категории по её id: у товара приходит только `categoryId`. */
  categoryNames?: Record<string, string>
  isLoading?: boolean
  skeletonCount?: number
  /** Что показать, когда ничего не нашлось. */
  emptyState?: ReactNode
  renderAction?: (product: IProduct) => ReactNode
  /** Слот в углу фотографии («в избранное») — см. `IProductCardProps['mediaAction']`. */
  renderMediaAction?: (product: IProduct) => ReactNode
  /**
   * Карточки выходят лесенкой по входу сетки в вьюпорт (главная). В каталоге
   * не включается: там сетка меняется от фильтров и пагинации, и лесенка на
   * каждой подмене читалась бы как перерисовка, а не как появление.
   */
  isStaggered?: boolean
}

export interface IProductDetailsProps {
  product: IProduct
  /** Название категории: у товара приходит только `categoryId`. */
  categoryName?: string | null
  action?: ReactNode
  /** Второе действие рядом с основным — «в избранное». */
  secondaryAction?: ReactNode
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

export interface IRegisterValues extends ILoginValues {
  name: string
}

export interface IForgotPasswordValues {
  /** E.164 — в этом виде его отдаёт `PhoneInput` и ждёт бэкенд. */
  phone: string
}

export interface IResetPasswordValues {
  code: string
  password: string
}

/** Состояние входа через Telegram — ровно то, что панель обязана показать. */
export type TelegramLoginStatus = 'preparing' | 'waiting' | 'expired' | 'error'

export interface ITelegramLoginPanelProps {
  /** Ссылка на бота с одноразовым payload; `null`, пока её не выдал сервер. */
  botUrl: string | null
  status: TelegramLoginStatus
  /** Готовая картинка QR — кодирует ссылку сайт, не библиотека виджетов. */
  qr?: ReactNode
  /**
   * Telegram Login Widget — слотом по той же причине, что и QR: кнопку рисует чужой
   * скрипт с telegram.org, и библиотеке виджетов такое знание ни к чему.
   */
  loginWidget?: ReactNode
  /** Текст сбоя; показывается только при `status: 'error'`. */
  error?: string | null
  onRetry: () => void
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
  /**
   * `inline` — строка, как в корзине, чекауте и админке (по умолчанию —
   * эти места меняться не должны). `blocks` — крупные блоки «дн/час/мин»
   * для панели героя.
   */
  variant?: 'inline' | 'blocks'
  /** Метку рисует внешняя панель (`StatusPanel`) — не дублировать. */
  isLabelHidden?: boolean
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
  /**
   * Идёт запрос, меняющий состав корзины целиком (очистка, перезагрузка): под
   * него блокируется переход к оформлению.
   *
   * Запросы по отдельным позициям сюда не попадают — иначе кнопка «Оформить»
   * гасла бы на каждое нажатие `−`/`+`; за них отвечает `isItemBusy`.
   */
  isBusy?: boolean
  /**
   * Занята ли конкретная позиция. Без этого запрос по одной строке гасил бы
   * контролы всех — на экране это читается как сбой, а не как ожидание.
   */
  isItemBusy?: (productId: string) => boolean
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

export interface ICheckoutPanelProps {
  cart: ICart | null
  buildProductHref: (productSlug: string) => string
  /** Куда вести за правкой состава — состав здесь только читается. */
  cartHref: string
  /** Форма оформления: встаёт во вторую колонку, рядом с составом. */
  form: ReactNode
  /**
   * Дозаказ: подборщик товаров под составом — тот же `ProductPicker`, что и в
   * открытой заявке. Пока корзина грузится, слот не рисуется: добавлять в
   * состав, которого ещё не видно, не к чему.
   */
  addItem?: ReactNode
  /** Первая загрузка корзины: скелетоны в раскладке состава. */
  isLoading?: boolean
  skeletonRows?: number
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

/**
 * Одна карточка позиции — общая у корзины, оформления и заявки.
 *
 * Что это за список, строка не знает: слова «корзина»/«заявка» приходят
 * подписями кнопки удаления, а всё остальное у трёх экранов одинаково.
 */
export interface IItemRowProps {
  item: IItemRowItem
  /**
   * `null` — товара больше нет в каталоге (`productId === null` в снапшоте
   * заявки), вести ссылке некуда, а название остаётся видно.
   */
  href: string | null
  /**
   * Управление количеством и удалением. Обе отсутствуют — строка только для
   * чтения: так состав показан на оформлении, после дедлайна и в админке.
   */
  onQuantityChange?: (quantity: number) => void
  onRemove?: () => void
  /**
   * Единственную позицию заявки убрать нельзя — бэкенд ответит отказом. Кнопка
   * остаётся видимой, но заблокированной, с подсказкой из `removeBlockedLabel`.
   */
  canRemove?: boolean
  /** `aria-label` кнопки удаления: «убрать» откуда — знает вызывающий, не строка. */
  removeLabel?: string
  /** Подпись заблокированной кнопки (`canRemove === false`) — там же объяснение. */
  removeBlockedLabel?: string
  /**
   * Идёт запрос по этой позиции: блокируется удаление — второе нажатие на
   * крестик отправило бы второй запрос по уже удалённой строке.
   */
  isBusy?: boolean
  /**
   * Гасить ли на время запроса и количество.
   *
   * В заявке — да: правка уходит на сервер как есть, и второе нажатие до
   * ответа спорит с первым. В корзине — нет: там количество меняется
   * оптимистично, а запросы уходят очередью, и быстрые нажатия должны
   * складываться (2 → 3 → 4), а не пропадать под курсором.
   */
  isQuantityBusy?: boolean
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
  /**
   * Позиция, по которой идёт запрос. Пока он про одну строку, гасить контролы
   * остальных не за что: на экране это читается как сбой всей карточки.
   * `null` при `isBusy` — действие про заявку целиком (отмена, комментарий,
   * добавление), и блокируется весь состав.
   */
  busyItemId?: string | null
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
  /**
   * Подпись на бейдже такого товара. Меняется вместе с получателем: до
   * оформления подборщик кладёт товар в корзину, а не в заявку, и «уже в
   * заявке» там было бы неправдой.
   */
  addedLabel?: string
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
  /** Фильтры раздела: встают под разделами в левой колонке. */
  sidebar?: ReactNode
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

/** Фото, выбранное при создании товара — грузится вместе с ним, отдельного id ещё нет. */
export interface IAdminProductPendingImage {
  file: File
  alt: string
}

export interface IAdminProductValues {
  name: string
  slug: string
  description: string
  brand: string
  priceCents: number
  /** `null` — объём не указан; бэкенд отвергает ноль, а не считает его пропуском. */
  volumeMl: number | null
  categoryId: string | null
  inStock: boolean
  /** `null` в режиме редактирования и когда при создании фото не выбрано. */
  image: IAdminProductPendingImage | null
}

export interface IProductImageUpload {
  file: File
  alt: string
}

export interface IAdminProductFormProps {
  categories: ICategory[]
  /**
   * Бренды, уже заведённые в каталоге, — подсказки для поля «Производитель».
   * Своей таблицы у брендов нет, они набираются руками, поэтому единственное,
   * что удерживает их от расползания по опечаткам и регистру, — этот список.
   */
  brands?: string[]
  /** Редактирование; `undefined` — создание нового товара. */
  product?: IProduct
  onSubmit: (values: IAdminProductValues) => void
  isSubmitting?: boolean
  error?: string | null
  /**
   * Фотография есть только у сохранённого товара: грузить её некуда, пока
   * у него нет id. При создании вместо неё показывается один выбор файла
   * (см. `IAdminProductValues.image`), который уходит вместе с сабмитом.
   *
   * Список, а не одна картинка: у товара фотография одна, но у заведённых
   * до этого правила могло остаться несколько — их нужно показать и дать удалить.
   */
  images?: IProductImage[]
  /** Загрузка — это замена: бэкенд убирает прежние фотографии товара. */
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
   * Досрочное закрытие. Кнопка появляется только у сбора, который сейчас идёт:
   * закрыть — значит прекратить приём заявок, а у запланированного и у
   * прошедшего этого состояния нет.
   */
  onClose?: (cycle: IOrderCycle) => void
  /**
   * id сбора, который бэкенд отдаёт как активный. Считается не по полю
   * `status`, а по ближайшему будущему дедлайну и незакрытому статусу —
   * `status` переставляет планировщик, и до его прогона он отстаёт от факта.
   *
   * Он же отвечает на вопрос, можно ли назначить новый сбор: открытый бывает
   * только один (`active_cycle_exists`).
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

/**
 * Аккаунт глазами владельца: то же, что у себя в профиле, плюс дата
 * регистрации — по ней список и упорядочен после владельцев.
 */
export interface IAdminUser extends IAuthUser {
  createdAt: string
}

export interface IAdminUsersTableProps {
  users: IAdminUser[]
  /**
   * Свой аккаунт: его строка не меняется. Владелец, разжаловавший себя, закрывает
   * магазину вход в собственную панель — бэкенд отвечает `own_role_change`.
   */
  currentUserId?: string | null
  onRoleChange: (user: IAdminUser, role: Role) => void
  isLoading?: boolean
  skeletonRows?: number
  /** id строки, по которой идёт запрос: блокируется только её кнопка. */
  busyId?: string | null
  emptyState?: ReactNode
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
