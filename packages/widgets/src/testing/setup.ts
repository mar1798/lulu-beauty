import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * Общий setup для vitest: матчеры `@testing-library/jest-dom`
 * (`toBeInTheDocument`, `toHaveValue`, …) и размонтирование дерева
 * между тестами — иначе `screen` видит DOM предыдущего теста.
 */
afterEach(() => {
  cleanup()
})

/**
 * `matchMedia` в jsdom не реализован, а на него смотрят и компоненты
 * (мобильное меню закрывается на широком экране), и `useReducedMotion`
 * из `motion`. Заглушка всегда отвечает «не совпало»: тесты идут в узком
 * viewport и с обычной анимацией, а слушатели просто никогда не срабатывают.
 */
if (typeof window !== 'undefined' && window.matchMedia === undefined) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList
}
