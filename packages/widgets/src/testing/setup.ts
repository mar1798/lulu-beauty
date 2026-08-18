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
/**
 * `ResizeObserver` в jsdom тоже не реализован, а на него опирается
 * `useScroll` из `motion` (параллакс `DecorField`, шапка поверх героя).
 * Заглушка ничего не наблюдает: скролла в jsdom всё равно нет.
 */
if (typeof window !== 'undefined' && window.ResizeObserver === undefined) {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

/**
 * `IntersectionObserver` нужен `whileInView` из `motion` (`Reveal`).
 * Заглушка никогда не «пересекается»: компоненты в тестах остаются в
 * начальном состоянии, а проверяем мы разметку, не анимацию.
 */
if (typeof window !== 'undefined' && window.IntersectionObserver === undefined) {
  window.IntersectionObserver = class {
    readonly root = null
    readonly rootMargin = ''
    readonly scrollMargin = ''
    readonly thresholds: readonly number[] = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
}

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
