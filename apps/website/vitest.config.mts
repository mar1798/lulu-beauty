/// <reference types="vitest/config" />

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Тесты сайта — хуки с логикой, которую типы не ловят (гонки SWR и т. п.).
 * Страницы и компоненты здесь не тестируются: вёрстка проверяется в
 * `widgets`, а сайт её только собирает.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
  },
})
