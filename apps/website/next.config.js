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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: MONOREPO_ROOT,
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
