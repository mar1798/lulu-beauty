/**
 * Ошибки API в виде, пригодном для показа пользователю.
 *
 * Бэкенд отвечает стандартным конвертом FastAPI: `{"detail": "<машинный код>"}`
 * для бизнес-ошибок и `{"detail": [{loc, msg, type}, ...]}` для 422-валидации.
 * Русских текстов бэкенд не знает вообще — весь UI-текст живёт здесь.
 */

/** Машинный код → текст для пользователя. Коды взяты из `raise HTTPException(...)` в `apps/api`. */
const MESSAGES: Record<string, string> = {
  // auth
  phone_already_registered: 'Этот номер уже зарегистрирован — попробуйте войти.',
  invalid_credentials: 'Неверный номер телефона или пароль.',
  phone_not_verified: 'Номер не подтверждён. Введите код из Telegram.',
  user_not_found: 'Пользователь с таким номером не найден.',
  otp_resend_too_soon: 'Код уже отправлен. Подождите немного перед повторной отправкой.',
  otp_expired_or_not_found: 'Срок действия кода истёк. Запросите новый.',
  otp_too_many_attempts: 'Слишком много попыток. Запросите новый код.',
  otp_invalid_code: 'Неверный код.',
  invalid_refresh_token: 'Сессия истекла. Войдите заново.',
  invalid_token: 'Сессия истекла. Войдите заново.',
  not_authenticated: 'Нужно войти в аккаунт.',
  admin_only: 'Доступ только для администратора.',

  // catalog
  product_not_found: 'Товар не найден.',
  product_image_not_found: 'Фотография не найдена.',
  category_not_found: 'Категория не найдена.',
  slug_already_exists: 'Такой адрес (slug) уже занят.',
  unsupported_image_type: 'Неподдерживаемый формат изображения.',
  image_too_large: 'Изображение слишком большое.',
  import_file_too_large: 'Файл импорта слишком большой.',

  // cycles
  no_active_cycle: 'Сейчас нет открытого сбора заказов.',
  cycle_not_found: 'Сбор не найден.',
  cycle_has_orders: 'В этом сборе уже есть заказы — удалить его нельзя.',
  deadline_must_be_future: 'Дедлайн должен быть в будущем.',

  // cart / orders
  cart_item_not_found: 'Этого товара нет в корзине.',
  cart_is_empty: 'Корзина пуста.',
  order_not_found: 'Заказ не найден.',
  order_item_not_found: 'Этой позиции в заявке нет — обновите страницу.',
  // Правку заявки закрывает либо дедлайн, либо переход заявки из «в ожидании»
  // (владелец уже начал закупку). Оба случая для покупателя — «поезд ушёл».
  order_not_editable: 'Заявку уже нельзя изменить: сбор закрылся или её взяли в работу.',
  // Пустая заявка бэкенду не нужна: у «убрать последний товар» есть свой смысл —
  // это отмена, и подсказать надо именно её.
  last_order_item: 'Это последняя позиция в заявке. Чтобы отказаться совсем, отмените заявку.',
  // Общий текст 409 тут не годится: человек нажал «Вернуть заявку» и должен
  // понять, что вернуть её больше нельзя, а не что «действие невозможно».
  order_not_restorable: 'Сбор уже закрылся — вернуть заявку нельзя. Оформите новую.',

  // коды, которые появляются только на стороне фронта
  validation_error: 'Проверьте правильность заполнения полей.',
  network_error: 'Не удалось связаться с сервером. Проверьте соединение.',
}

/** Запасные тексты по HTTP-статусу, когда код неизвестен (например, 500 без `detail`). */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Запрос отклонён.',
  401: 'Нужно войти в аккаунт.',
  403: 'Недостаточно прав.',
  404: 'Не найдено.',
  409: 'Действие невозможно в текущем состоянии.',
  413: 'Файл слишком большой.',
  415: 'Неподдерживаемый формат файла.',
  422: 'Проверьте правильность заполнения полей.',
  429: 'Слишком много запросов. Попробуйте позже.',
  500: 'Что-то пошло не так на сервере. Попробуйте позже.',
  503: 'Сервис временно недоступен. Попробуйте позже.',
}

const FALLBACK_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз.'

export const messageForCode = (code: string, status: number): string =>
  MESSAGES[code] ?? STATUS_MESSAGES[status] ?? FALLBACK_MESSAGE

export class ApiError extends Error {
  /** HTTP-статус ответа; `0` — до сервера вообще не дошли. */
  readonly status: number
  /** Машинный код из `detail` — по нему UI принимает решения, а не по тексту. */
  readonly code: string
  /** Разбор 422: имя поля → сообщение. Пусто для остальных ошибок. */
  readonly fields: Readonly<Record<string, string>>

  constructor(status: number, code: string, fields: Record<string, string> = {}) {
    super(messageForCode(code, status))
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

interface IValidationDetail {
  loc?: unknown[]
  msg?: string
}

const isValidationDetail = (value: unknown): value is IValidationDetail =>
  typeof value === 'object' && value !== null

/** `loc` вида `["body", "phone"]` → `phone`; служебные `body`/`query` отбрасываем. */
const fieldFromLoc = (loc: unknown[] | undefined): string | null => {
  const parts = (loc ?? []).filter((part): part is string => typeof part === 'string')
  const last = parts[parts.length - 1]

  return last === undefined || last === 'body' || last === 'query' ? null : last
}

const fieldsFromDetail = (detail: unknown[]): Record<string, string> => {
  const fields: Record<string, string> = {}

  for (const entry of detail) {
    if (!isValidationDetail(entry)) {
      continue
    }

    const field = fieldFromLoc(entry.loc)

    if (field !== null && fields[field] === undefined) {
      fields[field] = entry.msg ?? MESSAGES.validation_error
    }
  }

  return fields
}

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
    return new ApiError(response.status, 'validation_error', fieldsFromDetail(detail))
  }

  return new ApiError(response.status, `http_${response.status}`)
}
