function makeConfig<T extends Record<string, unknown>>(
  config: T
): <K extends keyof T>(key: K) => T[K] {
  return key => config[key]
}

export const publicConfig = makeConfig({
  baseUrl: process.env.NEXT_PUBLIC_WP_BASE_URL ?? 'invalid_env_value',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'invalid_env_value',
  /**
   * Адрес API для браузера. Приватные запросы всё равно ходят через
   * Next-прокси (`/api/proxy/*`), так что напрямую отсюда браузер берёт
   * только статику `/files/*`.
   */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
  /**
   * Имя бота без `@`. Ссылка на привязку Telegram обязана быть **чистой**
   * (`https://t.me/<username>`, без `?start=`): бот сравнивает текст
   * сообщения с `/start` точно, и deep-link с payload уедет в fallback.
   */
  telegramBotUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '',
} as const)

/**
 * Серверные переменные. В клиентский бандл Next подставляет только
 * `NEXT_PUBLIC_*`, поэтому в браузере эти значения молча подменились бы
 * дефолтами — чтение из браузера намеренно падает.
 */
const serverValues = {
  /** Адрес API для server-to-server (`getStaticProps`, Next API routes): в Docker это `http://api:3001`. */
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3001',
  /** Флаг `Secure` у cookie авторизации: снимается только для локального http. */
  authCookieSecure: process.env.AUTH_COOKIE_SECURE !== 'false',
} as const

export const serverConfig = <K extends keyof typeof serverValues>(
  key: K
): (typeof serverValues)[K] => {
  if (typeof window !== 'undefined') {
    throw new Error(
      `serverConfig(${String(key)}) прочитан в браузере: серверные переменные в клиентский бандл не попадают`
    )
  }

  return serverValues[key]
}

