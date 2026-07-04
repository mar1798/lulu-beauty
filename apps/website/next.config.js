const { createVanillaExtractPlugin } = require('@vanilla-extract/next-plugin')
const withPlugins = require('next-compose-plugins')
const { createSecureHeaders } = require('next-secure-headers')

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
const withVanillaExtract = createVanillaExtractPlugin()

const envFallbackUrl = process.env.FALLBACK_BASE_URL

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
  rewrites,
  headers,
  redirects,
}

async function redirects() {
  return [
    {
      source: '/sitemap.xml',
      destination: '/sitemap_index.xml',
      permanent: true,
    },
    {
      source: '/blog/:slug+',
      destination: '/resources/:slug+',
      permanent: true,
    },
  ]
}

async function rewrites() {
  return {
    beforeFiles: [],
    afterFiles: [
      {
        // yoast sitemaps
        source: '/sitemap_index.xml',
        destination: `${envFallbackUrl}/sitemap_index.xml`,
      },
      {
        // yoast sitemaps
        source: '/:sitemap([^/]*sitemap\\d*\\.xml)',
        destination: `${envFallbackUrl}/:sitemap`,
        basePath: false,
      },
      {
        source: '/robots.txt',
        destination: '/api/robots',
      },
    ],
  }
}

async function headers() {
  return [{ source: '/(.*)', headers: createSecureHeaders() }]
}

module.exports = withPlugins([withBundleAnalyzer, withVanillaExtract], nextConfig)
