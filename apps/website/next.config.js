const { createVanillaExtractPlugin } = require('@vanilla-extract/next-plugin')
const withPlugins = require('next-compose-plugins')
const withVanillaExtract = createVanillaExtractPlugin()

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
}


module.exports = withPlugins([withVanillaExtract], nextConfig)
