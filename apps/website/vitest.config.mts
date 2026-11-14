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
  /*
    Провайдеры контекстов — `.tsx`, а `tsconfig` сайта держит `jsx: preserve` для
    Next. Тестам их тоже надо собирать: перенос гостевой корзины живёт именно там
    (`contexts/guestMerge.test.ts`).
  */
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
  },
})
