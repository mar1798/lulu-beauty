const { createVanillaExtractPlugin } = require('@vanilla-extract/next-plugin')
const withPlugins = require('next-compose-plugins')
const withVanillaExtract = createVanillaExtractPlugin()

/**
 * Картинки товаров лежат на самом API (`PUBLIC_FILES_BASE_URL`, по умолчанию
 * `http://localhost:3001/files`). В проде это https и попадает под общий
 * wildcard ниже, а вот локальный http — нет, и `next/image` их бы заблокировал.
 * Поэтому хост API добавляется отдельным паттерном.
 * @returns {import('next').NextConfig['images']['remotePatterns']}
 */
const apiFilesPatterns = () => {
  try {
    const { protocol, hostname, port } = new URL(
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'
    )

    if (protocol !== 'http:') {
      return []
    }

    return [{ protocol: 'http', hostname, port, pathname: '/files/**' }]
  } catch {
    return []
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['widgets'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
        port: '',
        pathname: '**',
      },
      ...apiFilesPatterns(),
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
