/**
 * Ошибки API в виде, пригодном для показа пользователю.
 *
 * Бэкенд отвечает стандартным конвертом FastAPI: `{"detail": "<машинный код>"}`
 * для бизнес-ошибок и `{"detail": [{loc, msg, type, ctx}, ...]}` для 422-валидации.
 * Русских текстов бэкенд не знает вообще — весь UI-текст живёт здесь.
 *
 * Один и тот же код значит разное в разных местах: `no_active_cycle` при
 * добавлении в корзину — «сбор ещё не открыт», а при оформлении — «сбор
 * закрылся, пока вы собирали заявку». Поэтому текст выбирается парой
 * «код + область» (`ErrorScope`), а не одним кодом: общее «действие
 * невозможно» не объясняет человеку ничего.
 */

/**
 * Область, в которой произошла ошибка, — то самое, чего нет в коде ответа.
 * Передаётся из места вызова: `messageForError(cause, 'cart.add')`.
 */
export type ErrorScope =
  // корзина
  | 'cart.load'
  | 'cart.add'
  | 'cart.update'
  | 'cart.remove'
  | 'cart.empty'
  | 'checkout'
  // избранное
  | 'wishlist.load'
  | 'wishlist.add'
  | 'wishlist.remove'
  // заявки покупателя
  | 'order.load'
  | 'order.note'
  | 'order.item.add'
  | 'order.item.update'
  | 'order.item.remove'
  | 'order.cancel'
  | 'order.restore'
  // авторизация и профиль
  | 'auth.telegram'
  | 'account.save'
  | 'account.logout'
  // каталог (публичный)
  | 'catalog.load'
  | 'catalog.search'
  // админка
  | 'admin.products.load'
  | 'admin.product.create'
  | 'admin.product.update'
  | 'admin.product.delete'
  | 'admin.product.restore'
  | 'admin.product.images'
  | 'admin.categories'
  | 'admin.cycles'
  | 'admin.import'
  | 'admin.orders'
  | 'admin.users'
  | 'admin.export'

/**
 * Машинный код → текст по умолчанию. Коды взяты из `raise HTTPException(...)`
 * в `apps/api` (плюс несколько собственных, см. ниже) — на каждый код бэкенда
 * здесь обязана быть строка, иначе человек увидит заглушку по статусу.
 */
const MESSAGES: Record<string, string> = {
  // --- auth ---
  auth_session_expired: 'Ссылка для входа устарела — она живёт несколько минут. Получите новую.',
  auth_session_not_found: 'Вход не найден — начните заново.',
  auth_session_not_started: 'Не удалось начать вход. Попробуйте ещё раз.',
  telegram_auth_invalid: 'Telegram не подтвердил вход. Попробуйте ещё раз.',
  telegram_auth_expired: 'Подтверждение Telegram устарело. Нажмите «Войти» ещё раз.',
  /*
    Единственная из трёх, которую человек может исправить сам, — и исправляется она
    не здесь: подпись Telegram доказывает личность, но не даёт номера телефона, а без
    него аккаунта не существует. Заводится он только в боте.
  */
  telegram_account_not_linked:
    'Аккаунта с этим Telegram ещё нет. Откройте бота и поделитесь номером — это и есть регистрация.',
  invalid_refresh_token: 'Сессия истекла — войдите заново.',
  invalid_token: 'Сессия истекла — войдите заново.',
  not_authenticated: 'Нужно войти в аккаунт.',
  admin_only: 'Раздел доступен только владельцу магазина.',

  // --- каталог ---
  product_not_found: 'Товар не найден: возможно, его сняли с продажи. Обновите страницу.',
  product_image_not_found: 'Фотография не найдена — её уже удалили. Обновите страницу.',
  category_not_found: 'Категория не найдена — возможно, её удалили. Обновите страницу.',
  slug_already_exists: 'Такой адрес (slug) уже занят — он должен быть уникальным.',
  unsupported_image_type: 'Такой формат не поддерживается. Подойдут JPG, PNG или WebP.',
  image_too_large: 'Фотография больше 5 МБ. Сожмите её или выберите другую.',
  import_file_too_large: 'Файл больше 10 МБ. Разделите его на части или уберите лишние листы.',
  // Общий потолок тела запроса (BodySizeLimitMiddleware). Срабатывает раньше, чем
  // разбор формы, поэтому имени файла в ответе нет — только размер.
  request_body_too_large: 'Файл слишком большой. Загрузите файл поменьше.',

  // --- частота запросов ---
  // Лимитер бэкенда (app/common/rate_limit.py). Обычному человеку не достаётся:
  // бюджеты рассчитаны на страницу каталога с картинками и на вход в несколько шагов.
  rate_limited: 'Слишком много запросов подряд. Подождите минуту и повторите.',
  // Прокси Next не смог поговорить с API (429/500/502). Сессия при этом цела —
  // отдельно от 401 именно поэтому.
  upstream_unavailable: 'Сервис временно недоступен. Повторите через минуту.',
  cross_origin_forbidden: 'Запрос пришёл с чужой страницы и отклонён. Повторите на сайте.',

  // --- сборы ---
  no_active_cycle: 'Сейчас нет открытого сбора заказов. О следующем бот сообщит в Telegram.',
  cycle_not_found: 'Сбор не найден — возможно, его удалили. Обновите страницу.',
  cycle_has_orders:
    'В этом сборе уже есть заявки — удалить его нельзя. Закройте сбор вместо этого.',
  deadline_must_be_future: 'Дедлайн должен быть в будущем — иначе сбор закроется сразу.',
  // Открытый сбор ровно один: второй с более ранним дедлайном молча становился бы
  // главным, а корзины покупателей оставались бы в первом (см. BUGS.md п. 13).
  // Приходит и на создание второго сбора, и на перенос дедлайна закрытого в будущее —
  // это одно и то же действие с точки зрения правила, поэтому и текст один.
  active_cycle_exists:
    'Открытый сбор уже есть, и он может быть только один: второй оставит корзины покупателей в первом. Закройте текущий сбор или измените его дату.',
  cycle_already_closed: 'Этот сбор уже закрыт. Обновите страницу.',

  // --- корзина и заявки ---
  cart_item_not_found: 'Этой позиции в корзине уже нет. Обновите страницу.',
  cart_is_empty: 'В корзине пусто — отправлять нечего.',
  order_not_found: 'Заявка не найдена. Возможно, ссылка устарела или заявка на другом аккаунте.',
  order_item_not_found: 'Этой позиции в заявке нет — обновите страницу.',
  // Правку заявки закрывает либо дедлайн, либо переход заявки из «в ожидании»
  // (владелец уже начал закупку). Оба случая для покупателя — «поезд ушёл».
  order_not_editable: 'Заявку уже нельзя изменить: сбор закрылся или владелец взял её в работу.',
  // Пустая заявка бэкенду не нужна: у «убрать последний товар» есть свой смысл —
  // это отмена, и подсказать надо именно её.
  last_order_item: 'Это последняя позиция в заявке. Чтобы отказаться совсем, отмените заявку.',
  // Отмена вернулась бы, но возвращать нечего: последний товар заявки сняли с продажи
  // (см. `drop_product` на бэке) — или сбор уже закрылся.
  order_not_restorable: 'Вернуть заявку нельзя: сбор закрылся или в ней не осталось товаров.',
  // «Отменена покупателем» — утверждение о его действии, и ставить его владелец не может:
  // своя отмена у него называется «Отменена владельцем».
  order_status_not_assignable:
    'Этот статус ставит сам покупатель. Чтобы отказать по заявке, выберите «Отменена владельцем».',
  // Статус существует, но из текущего в него не перейти: отменённую заявку нельзя
  // «подтвердить» задним числом, а выданную — вернуть в ожидание (ALLOWED_TRANSITIONS
  // в app/orders/models.py).
  order_status_transition_invalid:
    'Из текущего статуса так перейти нельзя. Обновите список — статус заявки уже изменился.',

  // Разжаловать себя нельзя: последний владелец закрыл бы магазину вход в
  // собственную админку, а обратно пускала бы только консоль базы.
  own_role_change: 'Свою роль изменить нельзя. Попросите об этом другого владельца.',
  user_not_found: 'Аккаунт не найден — возможно, его удалили. Обновите список.',

  // --- избранное ---
  wishlist_item_not_found: 'Этого товара нет в избранном. Обновите страницу.',
  wishlist_full: 'В избранном слишком много товаров. Уберите ненужное, чтобы добавить новое.',

  // --- коды, которые появляются только на стороне фронта и прокси ---
  // `pages/api/proxy/[...path].ts` закрывает `/auth/*`: пара JWT не должна уйти в браузер.
  not_found: 'Запрос ушёл не туда. Обновите страницу — возможно, вкладка открыта давно.',
  method_not_allowed: 'Запрос ушёл не туда. Обновите страницу.',
  validation_error: 'Проверьте заполнение полей — что-то не подошло.',
  network_error: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
}

/**
 * Уточнения под конкретное действие. Берутся раньше `MESSAGES`: общий текст
 * кода описывает состояние («нет открытого сбора»), а здесь сказано, что это
 * значит именно для нажатой кнопки.
 *
 * Ключ второго уровня — код либо `http_<статус>` для ответов без кода.
 */
const SCOPED: Partial<Record<ErrorScope, Record<string, string>>> = {
  'cart.add': {
    no_active_cycle:
      'Приём заказов закрыт: сейчас нет открытого сбора. Товар можно будет добавить, когда откроется следующий сбор.',
    product_not_found: 'Товар сняли с продажи, пока страница была открыта. Обновите каталог.',
    not_authenticated: 'Корзина привязана к аккаунту — войдите, чтобы добавить товар.',
    invalid_token: 'Сессия истекла. Войдите заново — корзина сохранится.',
  },
  'cart.update': {
    no_active_cycle: 'Сбор закрылся, пока корзина была открыта. Менять её уже нельзя.',
    cart_item_not_found: 'Этой позиции в корзине больше нет. Обновите страницу.',
  },
  'cart.remove': {
    cart_item_not_found: 'Позицию уже убрали из корзины. Обновите страницу.',
  },
  'cart.load': {
    not_authenticated: 'Корзина у каждого своя — войдите, чтобы увидеть её.',
  },
  'wishlist.add': {
    product_not_found: 'Товар сняли с продажи, пока страница была открыта. Обновите каталог.',
    not_authenticated: 'Избранное привязано к аккаунту — войдите, чтобы сохранить товар.',
    invalid_token: 'Сессия истекла. Войдите заново — избранное сохранится.',
  },
  'wishlist.remove': {
    wishlist_item_not_found: 'Товар уже убрали из избранного. Обновите страницу.',
  },
  'wishlist.load': {
    not_authenticated: 'Избранное у каждого своё — войдите, чтобы увидеть его.',
  },
  checkout: {
    no_active_cycle:
      'Сбор закрылся — отправить заявку уже нельзя. Корзина сохранится до следующего сбора.',
    cart_is_empty: 'Корзина пуста — добавьте товары из каталога, прежде чем оформлять заявку.',
    not_authenticated: 'Сессия истекла. Войдите заново и отправьте заявку ещё раз.',
    invalid_token: 'Сессия истекла. Войдите заново и отправьте заявку ещё раз.',
  },

  'order.note': {
    order_not_editable:
      'Комментарий уже не изменить: сбор закрылся или владелец взял заявку в работу.',
  },
  'order.item.add': {
    order_not_editable: 'Добавить товар нельзя: сбор закрылся или заявку взяли в работу.',
    product_not_found: 'Этого товара больше нет в каталоге — добавить его в заявку нельзя.',
  },
  'order.item.update': {
    order_not_editable: 'Количество уже не изменить: сбор закрылся или заявку взяли в работу.',
    order_item_not_found: 'Этой позиции в заявке уже нет. Обновите страницу.',
  },
  'order.item.remove': {
    order_not_editable: 'Убрать позицию нельзя: сбор закрылся или заявку взяли в работу.',
    order_item_not_found: 'Позицию уже убрали. Обновите страницу.',
  },
  'order.cancel': {
    order_not_editable:
      'Отменить заявку нельзя: сбор закрылся или владелец взял её в работу. Свяжитесь с ним напрямую.',
  },
  'order.restore': {
    order_not_editable: 'Сбор уже закрылся — вернуть заявку нельзя. Оформите новую.',
  },

  'admin.product.create': {
    slug_already_exists: 'Товар с таким адресом (slug) уже есть. Измените slug.',
    category_not_found: 'Выбранной категории больше нет — обновите страницу и выберите заново.',
  },
  'admin.product.update': {
    slug_already_exists: 'Другой товар уже занял этот адрес (slug). Измените slug.',
    product_not_found: 'Товар удалён — сохранять нечего. Вернитесь к списку.',
  },
  'admin.product.images': {
    unsupported_image_type:
      'Подойдут только JPG, PNG или WebP. Пересохраните файл в этих форматах.',
    image_too_large: 'Фотография больше 5 МБ — сожмите её и загрузите снова.',
    product_not_found: 'Товар удалён — загружать фотографии некуда.',
  },
  'admin.categories': {
    slug_already_exists: 'Категория с таким адресом (slug) уже есть. Измените slug.',
  },
  'admin.cycles': {
    deadline_must_be_future: 'Дедлайн должен быть в будущем — иначе сбор закроется сразу.',
    // Открытый сбор ровно один: второй с более ранним дедлайном молча становился бы
    // главным, а корзины покупателей оставались бы в первом (см. BUGS.md п. 13).
    active_cycle_exists:
      'Открытый сбор уже есть. Измените его дату и время — второй сбор оставит корзины покупателей в первом.',
    cycle_already_closed: 'Этот сбор уже закрыт. Обновите страницу.',
    cycle_has_orders:
      'В сборе уже есть заявки — удалить его нельзя. Закройте сбор вместо удаления.',
  },
  'admin.import': {
    // 422 здесь означает «файл не тот», а не «поле не заполнено».
    validation_error: 'Файл не принят: нужен .xlsx или .csv с колонками из шаблона.',
    http_422: 'Файл не принят: нужен .xlsx или .csv с колонками из шаблона.',
  },
  'admin.export': {
    no_active_cycle: 'Выгружать нечего: сборов ещё не было.',
  },
}

/** Запасные тексты по HTTP-статусу, когда код неизвестен (например, 500 без `detail`). */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Запрос отклонён — данные не подошли. Проверьте поля и попробуйте снова.',
  401: 'Сессия истекла — войдите заново.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Не найдено: возможно, страница открыта давно и данные изменились.',
  409: 'Данные успели измениться — обновите страницу и попробуйте снова.',
  413: 'Файл слишком большой.',
  415: 'Формат файла не поддерживается.',
  422: 'Проверьте заполнение полей — что-то не подошло.',
  429: 'Слишком много запросов подряд. Подождите немного и повторите.',
  500: 'Ошибка на сервере. Мы уже знаем — попробуйте через пару минут.',
  502: 'Сервер не отвечает. Попробуйте через пару минут.',
  503: 'Сервис временно недоступен. Попробуйте через пару минут.',
  504: 'Сервер не успел ответить. Попробуйте ещё раз.',
}

/**
 * Последний рубеж: что именно не получилось. Показывается, только когда ни код,
 * ни статус ничего не сказали, — но даже тогда человек видит действие, а не
 * «что-то пошло не так».
 */
const SCOPE_FALLBACKS: Record<ErrorScope, string> = {
  'cart.load': 'Не удалось загрузить корзину.',
  'cart.add': 'Не удалось добавить товар в корзину.',
  'cart.update': 'Не удалось изменить количество.',
  'cart.remove': 'Не удалось убрать товар из корзины.',
  'cart.empty': 'Не удалось очистить корзину.',
  'wishlist.load': 'Не удалось загрузить избранное.',
  'wishlist.add': 'Не удалось добавить товар в избранное.',
  'wishlist.remove': 'Не удалось убрать товар из избранного.',
  checkout: 'Не удалось отправить заявку.',
  'order.load': 'Не удалось загрузить заявку.',
  'order.note': 'Не удалось сохранить комментарий.',
  'order.item.add': 'Не удалось добавить товар в заявку.',
  'order.item.update': 'Не удалось изменить количество в заявке.',
  'order.item.remove': 'Не удалось убрать позицию из заявки.',
  'order.cancel': 'Не удалось отменить заявку.',
  'order.restore': 'Не удалось вернуть заявку.',
  'auth.telegram': 'Не удалось начать вход через Telegram.',
  'account.save': 'Не удалось сохранить профиль.',
  // Выход не состоялся: cookie на месте, сессия жива — человеку надо об этом сказать,
  // иначе он уйдёт с чужого устройства, считая, что вышел.
  'account.logout': 'Не удалось выйти. Проверьте связь и попробуйте ещё раз.',
  'catalog.load': 'Не удалось загрузить каталог.',
  'catalog.search': 'Не удалось выполнить поиск.',
  'admin.products.load': 'Не удалось загрузить товары.',
  'admin.product.create': 'Не удалось создать товар.',
  'admin.product.update': 'Не удалось сохранить товар.',
  'admin.product.delete': 'Не удалось удалить товар.',
  'admin.product.restore': 'Не удалось восстановить товар.',
  'admin.product.images': 'Не удалось изменить фотографии.',
  'admin.categories': 'Не удалось изменить категории.',
  'admin.cycles': 'Не удалось изменить сбор.',
  'admin.import': 'Не удалось импортировать файл.',
  'admin.orders': 'Не удалось загрузить заявки.',
  'admin.users': 'Не удалось загрузить аккаунты.',
  'admin.export': 'Не удалось выгрузить заявки.',
}

const FALLBACK_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз.'

/* ------------------------------------------------------------------ *
 * Разбор 422: pydantic отвечает по-английски, человеку это не годится *
 * ------------------------------------------------------------------ */

/** Имя поля (camelCase, как в `CamelModel`) → как его зовут на экране. */
const FIELD_LABELS: Record<string, string> = {
  phone: 'Телефон',
  password: 'Пароль',
  newPassword: 'Новый пароль',
  name: 'Имя',
  code: 'Код из Telegram',
  purpose: 'Тип кода',
  quantity: 'Количество',
  note: 'Комментарий',
  slug: 'Адрес (slug)',
  priceCents: 'Цена',
  brand: 'Бренд',
  description: 'Описание',
  categoryId: 'Категория',
  sortOrder: 'Порядок',
  volumeMl: 'Объём',
  inStock: 'Наличие',
  deadlineAt: 'Дата закрытия',
  label: 'Название сбора',
  status: 'Статус',
  productId: 'Товар',
  file: 'Файл',
  alt: 'Описание фотографии',
  page: 'Страница',
  pageSize: 'Размер страницы',
}

/** Поля, у которых «неверный формат» обязан быть конкретным — иначе не починить. */
const PATTERN_RULES: Record<string, string> = {
  phone: 'нужен номер в формате +79991234567',
  code: 'нужны шесть цифр из сообщения бота',
  slug: 'только латиница в нижнем регистре, цифры и дефис — например, krem-dlya-ruk',
}

/** Поля, где сырое число из ответа только запутает (цена приходит в копейках). */
const RANGE_RULES: Record<string, string> = {
  priceCents: 'слишком большая — проверьте, не лишний ли ноль',
}

interface IValidationDetail {
  loc?: unknown[]
  msg?: string
  type?: string
  ctx?: Record<string, unknown>
}

const numberFrom = (ctx: Record<string, unknown> | undefined, key: string): number | null => {
  const value = ctx?.[key]

  return typeof value === 'number' ? value : null
}

/** Человеческое «что не так» по типу ошибки pydantic. */
const ruleFor = (entry: IValidationDetail, field: string): string => {
  const { ctx } = entry

  switch (entry.type) {
    case 'missing':
      return 'обязательное поле'
    case 'string_too_short': {
      const min = numberFrom(ctx, 'min_length')

      return min === null || min <= 1 ? 'не может быть пустым' : `не короче ${min} символов`
    }
    case 'string_too_long': {
      const max = numberFrom(ctx, 'max_length')

      return max === null ? 'слишком длинное значение' : `не длиннее ${max} символов`
    }
    case 'string_pattern_mismatch':
      return PATTERN_RULES[field] ?? 'формат не подходит'
    case 'greater_than_equal':
    case 'greater_than': {
      const limit = numberFrom(ctx, 'ge') ?? numberFrom(ctx, 'gt')

      return RANGE_RULES[field] ?? (limit === null ? 'слишком маленькое' : `не меньше ${limit}`)
    }
    case 'less_than_equal':
    case 'less_than': {
      const limit = numberFrom(ctx, 'le') ?? numberFrom(ctx, 'lt')

      return RANGE_RULES[field] ?? (limit === null ? 'слишком большое' : `не больше ${limit}`)
    }
    case 'int_parsing':
    case 'int_type':
    case 'float_parsing':
    case 'decimal_parsing':
      return 'нужно число'
    case 'bool_parsing':
    case 'bool_type':
      return 'нужно «да» или «нет»'
    case 'uuid_parsing':
    case 'uuid_type':
      return 'неверный идентификатор — обновите страницу'
    case 'datetime_parsing':
    case 'datetime_type':
    case 'datetime_from_date_parsing':
      return 'неверная дата или время'
    case 'enum':
    case 'literal_error':
      return 'недопустимое значение'
    case 'string_type':
      return 'нужен текст'
    case 'json_invalid':
      return 'запрос не разобран — обновите страницу'
    default:
      return 'значение не подошло'
  }
}

const isValidationDetail = (value: unknown): value is IValidationDetail =>
  typeof value === 'object' && value !== null

/** `loc` вида `["body", "phone"]` → `phone`; служебные `body`/`query` отбрасываем. */
const fieldFromLoc = (loc: unknown[] | undefined): string | null => {
  const parts = (loc ?? []).filter((part): part is string => typeof part === 'string')
  const last = parts[parts.length - 1]

  return last === undefined || last === 'body' || last === 'query' ? null : last
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

const labelFor = (field: string): string => FIELD_LABELS[field] ?? field

interface IFieldIssue {
  field: string
  rule: string
}

const issuesFromDetail = (detail: unknown[]): IFieldIssue[] => {
  const issues: IFieldIssue[] = []
  const seen = new Set<string>()

  for (const entry of detail) {
    if (!isValidationDetail(entry)) {
      continue
    }

    const field = fieldFromLoc(entry.loc)

    // Одно поле — одна претензия: показывать «не короче 8» и «формат» разом незачем.
    if (field === null || seen.has(field)) {
      continue
    }

    seen.add(field)
    issues.push({ field, rule: ruleFor(entry, field) })
  }

  return issues
}

/** Сколько полей перечисляем в одной строке: дальше это уже не подсказка, а простыня. */
const MAX_LISTED_FIELDS = 3

/**
 * Сводка по 422 — то, что человек увидит вместо «проверьте поля»:
 * «Пароль: не короче 8 символов; Телефон: нужен номер в формате +79991234567.»
 */
const summaryOfIssues = (issues: IFieldIssue[]): string | null => {
  if (issues.length === 0) {
    return null
  }

  const listed = issues
    .slice(0, MAX_LISTED_FIELDS)
    .map(issue => `${labelFor(issue.field)}: ${issue.rule}`)
    .join('; ')

  return issues.length > MAX_LISTED_FIELDS ? `${listed} — и другие поля.` : `${listed}.`
}

/* ------------------------------------------------------------------ *
 * Собственно ошибка                                                   *
 * ------------------------------------------------------------------ */

/**
 * Текст по коду и статусу с учётом области, где всё произошло.
 *
 * Порядок не случаен: уточнение под действие важнее разбора полей (импорт
 * каталога — тот же 422, но «файл не тот», а не «заполните поле»), разбор
 * полей важнее общего текста кода, и только потом идут заглушки.
 */
const resolveMessage = (
  code: string,
  status: number,
  issues: readonly IFieldIssue[],
  scope?: ErrorScope
): string => {
  const scoped = scope === undefined ? undefined : SCOPED[scope]

  return (
    scoped?.[code] ??
    scoped?.[`http_${status}`] ??
    summaryOfIssues([...issues]) ??
    MESSAGES[code] ??
    STATUS_MESSAGES[status] ??
    (scope === undefined ? FALLBACK_MESSAGE : SCOPE_FALLBACKS[scope])
  )
}

/** Текст по коду и статусу вне контекста действия — для кодов без разбора полей. */
export const messageForCode = (code: string, status: number): string =>
  resolveMessage(code, status, [])

export class ApiError extends Error {
  /** HTTP-статус ответа; `0` — до сервера вообще не дошли. */
  readonly status: number
  /** Машинный код из `detail` — по нему UI принимает решения, а не по тексту. */
  readonly code: string
  /** Разбор 422: имя поля → готовая подпись под инпут. Пусто для остальных ошибок. */
  readonly fields: Readonly<Record<string, string>>
  /** Разбор 422 в исходном виде — из него собирается текст под нужную область. */
  private readonly issues: readonly IFieldIssue[]

  constructor(status: number, code: string, issues: readonly IFieldIssue[] = []) {
    super(resolveMessage(code, status, issues))
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues
    this.fields = Object.fromEntries(
      issues.map(issue => [issue.field, `${capitalize(issue.rule)}.`])
    )
  }

  /** Тот же разбор, но с поправкой на действие: см. `SCOPED`. */
  messageFor(scope: ErrorScope): string {
    return resolveMessage(this.code, this.status, this.issues, scope)
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

/**
 * Главная точка входа для экранов: текст ошибки под конкретное действие.
 * Не-`ApiError` (баг в обработчике, отвалившийся JSON) тоже получает
 * осмысленный текст — по области, а не «что-то пошло не так».
 */
export const messageForError = (cause: unknown, scope: ErrorScope): string =>
  isApiError(cause) ? cause.messageFor(scope) : SCOPE_FALLBACKS[scope]

/** Превращает неуспешный ответ в `ApiError`, не бросая на пустом/нечитаемом теле. */
export const toApiError = async (response: Response): Promise<ApiError> => {
  let detail: unknown = null

  try {
    const payload: unknown = await response.json()

    if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
      detail = (payload as { detail: unknown }).detail
    }
  } catch {
    detail = null
  }

  if (typeof detail === 'string') {
    return new ApiError(response.status, detail)
  }

  if (Array.isArray(detail)) {
    return new ApiError(response.status, 'validation_error', issuesFromDetail(detail))
  }

  return new ApiError(response.status, `http_${response.status}`)
}
