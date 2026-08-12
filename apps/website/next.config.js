const { createVanillaExtractPlugin } = require('@vanilla-extract/next-plugin')
const withPlugins = require('next-compose-plugins')
const withVanillaExtract = createVanillaExtractPlugin()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
        port: '',
        pathname: '**',
      },
    ],
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


module.exports = withPlugins([withVanillaExtract], nextConfig)
