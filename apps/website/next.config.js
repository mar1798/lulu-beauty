const path = require('path')
const { createVanillaExtractPlugin } = require('@vanilla-extract/next-plugin')
const withPlugins = require('next-compose-plugins')
const withVanillaExtract = createVanillaExtractPlugin()

/**
 * Корень монорепозитория.
 *
 * Next выводит его сам по расположению лок-файлов и промахивается: если выше по
 * дереву найдётся ещё один `package-lock.json` (например, случайный в домашней
 * директории), корнем станет он, и `output: 'standalone'` будет трассировать
 * зависимости не от того места.
 */
const MONOREPO_ROOT = path.join(__dirname, '..', '..')

/**
 * Отчёт по размеру бандла: `npm run analyze -w website` (то же самое, что
 * `ANALYZE=true npm run build -w website`).
 *
 * Включается только переменной окружения — без неё плагин ничего не делает,
 * поэтому обычные `build`/`dev` он не замедляет и в CI не мешает. Результат —
 * три html-файла в `.next/analyze/` (`client.html` — тот, что нужен почти
 * всегда: он показывает, из чего собран каждый чанк страницы).
 *
 * Считает он **несжатые** байты; по проводу уходит примерно втрое меньше,
 * так что сравнивать с бюджетами имеет смысл колонку gzip/brotli в самом
 * отчёте, а не «stat size».
 */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/**
 * Источники, которые политика обязана пропускать, — все до одного из-за Telegram.
 *
 * `telegram.org` — два чужих скрипта: SDK мини-приложения
 * (`utils/telegramMiniApp.ts`) и виджет входа (`components/TelegramLoginWidget.tsx`).
 * `oauth.telegram.org` — iframe самой кнопки «Log in with Telegram»: она обязана
 * быть настоящим фреймом с домена Telegram, иначе Telegram по ней не авторизует.
 * `web.telegram.org` во `frame-ancestors` — наоборот, про нас: сайт открывается
 * как Mini App **внутри** Telegram, поэтому запретить фрейминг целиком нельзя.
 */
const TELEGRAM_SCRIPTS = 'https://telegram.org'
const TELEGRAM_WIDGET_FRAME = 'https://oauth.telegram.org'
const TELEGRAM_HOSTS = 'https://web.telegram.org https://*.web.telegram.org https://telegram.org'

/**
 * Куда браузер отправляет нарушения — своя же ручка
 * `src/pages/api/csp-report.ts`, пишущая их в stdout (то есть в
 * `docker compose logs website`). Своя, а не внешний сервис: отдельный приёмник
 * ради нескольких отчётов в сутки не нужен, а чужой хост пришлось бы вписывать
 * в саму политику.
 *
 * Директив две, потому что форматов два: `report-uri` понимают все браузеры и
 * он объявлен устаревшим, `report-to` — замена, и она работает лишь вместе с
 * заголовком `Reporting-Endpoints` ниже. Браузер, знающий обе, шлёт отчёт один
 * раз — по `report-to`.
 *
 * Разница между ними не только в возрасте: `report-uri` принимает
 * относительный путь (браузер достраивает его от адреса страницы), а
 * `Reporting-Endpoints` — только абсолютный и только https. Поэтому вторая
 * половина включается, лишь когда домен известен: в разработке (`http://
 * localhost:3000`) её не будет, и отчёты придут по `report-uri`, чего для
 * проверки руками достаточно.
 */
const CSP_REPORT_PATH = '/api/csp-report'
const CSP_REPORTING_GROUP = 'csp'
const CSP_REPORT_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://')
  ? `${process.env.NEXT_PUBLIC_SITE_URL}${CSP_REPORT_PATH}`
  : undefined
const CSP_REPORTING = [
  `report-uri ${CSP_REPORT_PATH}`,
  ...(CSP_REPORT_URL === undefined ? [] : [`report-to ${CSP_REPORTING_GROUP}`]),
]

/**
 * Часть политики, которую можно включать принудительно уже сейчас.
 *
 * Здесь только директивы, про которые точно известно, что сайт их не нарушает:
 * форм наружу нет, `<base>` нет, плагинных объектов нет. Ошибиться нечем, а
 * закрывают они самое неприятное — угон отправки формы и подмену базового
 * адреса, если разметка когда-нибудь протечёт.
 *
 * Отчёты она тоже шлёт: нарушение здесь означает, что что-то уже сломано в
 * браузере посетителя, и узнать об этом нужно тем более. В логе такие видны по
 * `enforce` против `report` у остальных.
 */
const ENFORCED_CSP = [
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  `frame-ancestors 'self' ${TELEGRAM_HOSTS}`,
  ...CSP_REPORTING,
].join('; ')

/**
 * Полная политика — пока **только отчётом**.
 *
 * Включать её принудительно вслепую нельзя: страницы отдаются статикой, а
 * значит nonce на каждый запрос не выдать, и inline-скрипты Next (тот самый
 * `__NEXT_DATA__`) держатся на `'unsafe-inline'`. Пока это так, польза от
 * `script-src` невелика, зато шанс молча погасить кнопку входа — вполне
 * реален. Поэтому сначала браузеры присылают нарушения, и только потом,
 * разобрав их, политику имеет смысл переводить в принудительный режим.
 *
 * `blob:` в `img-src` — предпросмотр картинки товара в админке
 * (`AdminProductForm`), `data:` — QR-код входа (`useQrCode`).
 * `style-src 'unsafe-inline'` — inline-стили Next и позиционирование
 * выпадающих списков; vanilla-extract здесь ни при чём, он отдаёт настоящие
 * файлы.
 *
 * Нарушения собираются в лог — см. `CSP_REPORTING` выше и
 * «Шаг 10» в docs/deployment.md.
 */
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TELEGRAM_SCRIPTS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Весь обмен с API идёт через свой же `/api/proxy` — чужих адресов нет.
  "connect-src 'self'",
  `frame-src ${TELEGRAM_WIDGET_FRAME}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  `frame-ancestors 'self' ${TELEGRAM_HOSTS}`,
  ...CSP_REPORTING,
].join('; ')

/**
 * Возможности браузера, которые магазину косметики не нужны ни на одной
 * странице. Пустой список источников — «никому, включая нас самих».
 */
const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'interest-cohort=()',
].join(', ')

/**
 * Хосты, которым dev-сервер отдаёт свои внутренние ресурсы (`/_next/*`,
 * включая websocket `/_next/webpack-hmr`).
 *
 * Next 16 блокирует их для любого origin, кроме `localhost`, — и отказ виден
 * не сообщением об ошибке, а **самопроизвольной перезагрузкой страницы**:
 * клиент HMR не может открыть сокет, переподключается (5 раз по секунде,
 * дальше по пять) и после 25 неудач делает `window.location.reload()`.
 * Получается полный reload примерно каждые полторы минуты, по кругу. Ровно
 * это ловится при заходе с телефона по адресу вида `192.168.x.x:3000` или
 * при открытии сайта как Mini App внутри Telegram.
 *
 * Поэтому здесь перечислены частные диапазоны — те, из которых приходит
 * своё же устройство в домашней сети. Публичных адресов в списке нет:
 * настройка живёт только в разработке (в проде dev-ресурсов не существует),
 * но расширять её до `*` всё равно незачем.
 *
 * Туннель наружу (ngrok и подобные) даёт чужое имя хоста — его нужно
 * добавить через `NEXT_DEV_ORIGINS` (список через запятую) в `.env`, а не
 * вписывать сюда.
 */
const LOCAL_NETWORK_DEV_ORIGINS = [
  '192.168.*.*',
  '10.*.*.*',
  // 172.16.0.0/12 — второй сегмент перечисляется поштучно: `*` в шаблоне
  // Next заменяет сегмент целиком, частичного `172.2*` он не понимает.
  ...Array.from({ length: 16 }, (_, index) => `172.${16 + index}.*.*`),
  '127.0.0.1',
  '*.local',
]

const ALLOWED_DEV_ORIGINS = [
  ...LOCAL_NETWORK_DEV_ORIGINS,
  ...(process.env.NEXT_DEV_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: MONOREPO_ROOT,
  /**
   * Заголовки безопасности на весь сайт.
   *
   * `X-Frame-Options` здесь намеренно **нет**: он умеет только `DENY`
   * и `SAMEORIGIN`, а нам нужно разрешить ровно один чужой домен (Telegram) —
   * это выражается только через `frame-ancestors`, и там оно и написано.
   *
   * `Strict-Transport-Security` ставится только в проде: на `localhost` он
   * заставил бы браузер запомнить обязательный https для всего порта и
   * сломал бы локальную разработку — причём надолго, до ручной чистки.
   * @returns {Promise<import('next').Header[]>}
   */
  async headers() {
    const headers = [
      { key: 'Content-Security-Policy', value: ENFORCED_CSP },
      { key: 'Content-Security-Policy-Report-Only', value: REPORT_ONLY_CSP },
      // Браузер не должен угадывать тип: выгрузка xlsx и картинки товаров
      // отдаются с честным Content-Type, угадывание тут может только навредить.
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ]

    // Адресат `report-to` обеих политик. Без этого заголовка группа `csp`
    // браузеру неизвестна, и отчёт по ней просто никуда не уходит.
    if (CSP_REPORT_URL !== undefined) {
      headers.push({
        key: 'Reporting-Endpoints',
        value: `${CSP_REPORTING_GROUP}="${CSP_REPORT_URL}"`,
      })
    }

    if (process.env.NODE_ENV === 'production') {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains',
      })
    }

    return [{ source: '/:path*', headers }]
  },
  /**
   * Картинки товаров лежат на API (`PUBLIC_FILES_BASE_URL`), но браузеру и
   * `next/image` отдаются как **свои** — `/files/*`.
   *
   * Так пришлось сделать из-за Next 16: оптимизатор картинок отказывается
   * ходить на хост, который резолвится в приватный IP («resolved to private
   * ip»), поэтому `http://localhost:3001/files/*` не спасал никакой
   * `remotePatterns` — только `images.dangerouslyAllowLocalIP`. Прокси через
   * сам Next решает это без опасных флагов и заодно делает картинки
   * same-origin в проде: адрес API наружу светить не нужно.
   * Абсолютный адрес в относительный превращает адаптер `src/components/Image.tsx`.
   * @returns {Promise<import('next').Rewrite[]>}
   */
  async rewrites() {
    const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001'

    return [{ source: '/files/:path*', destination: `${apiBaseUrl}/files/:path*` }]
  },
  allowedDevOrigins: ALLOWED_DEV_ORIGINS,
  reactStrictMode: true,
  transpilePackages: ['widgets'],
  /**
   * `widgets` отдаётся сабпасами-бочками (`widgets/atoms` и т.д.), а бочка —
   * это `export * from` по всем компонентам раздела. Из-за этого страница,
   * которой нужна одна `Button`, тянула в свой чанк всю библиотеку: в dev у
   * `/login` в бандле оказывалось ~215 модулей `widgets` (админские таблицы,
   * календарь сборов, сетка каталога), а сам чанк весил 6 МБ.
   *
   * `optimizePackageImports` переписывает импорт из бочки в прямые импорты
   * нужных файлов ещё на уровне SWC, поэтому и dev-компиляция, и итоговый
   * бандл считаются только по фактически используемым компонентам.
   */
  experimental: {
    optimizePackageImports: [
      'widgets/atoms',
      'widgets/molecules',
      'widgets/organisms',
      'widgets/templates',
      'widgets/contexts',
      'widgets/hooks',
      'widgets/utils',
      'widgets/styling/lib',
      'widgets/styling/mixin',
    ],
  },
  /**
   * `remotePatterns` намеренно пуст: все картинки сайта — свои.
   *
   * Фотографии товаров лежат на API, но браузеру отдаются через рерайт `/files/*`
   * выше (абсолютный адрес в относительный превращает `src/components/Image.tsx`),
   * то есть для оптимизатора они same-origin. Прежний `hostname: '**'` разрешал
   * `/_next/image?url=https://любой-хост/...`, превращая сайт в открытый
   * прокси-ресайзер чужих картинок за наш трафик и наш IP.
   *
   * Понадобится внешний хост — его нужно вписать сюда явным паттерном.
   */
  images: {
    remotePatterns: [],
    formats: ['image/avif', 'image/webp'],
  },
  webpack: config => {
    config.module.rules = [
      ...config.module.rules,
      {
        test: /\.svg$/i,
        issuer: /\.tsx?$/,
        use: ['@svgr/webpack', 'url-loader'],
      },
    ]
    return config
  },
}

module.exports = withPlugins([withVanillaExtract, withBundleAnalyzer], nextConfig)
