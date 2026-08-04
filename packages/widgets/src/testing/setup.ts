import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Общий setup для vitest: матчеры `@testing-library/jest-dom`
 * (`toBeInTheDocument`, `toHaveValue`, …) и размонтирование дерева
 * между тестами — иначе `screen` видит DOM предыдущего теста.
 */
afterEach(() => {
  cleanup()
})
