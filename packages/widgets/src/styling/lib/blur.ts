import { rem } from './rem'

/**
 * Helper function to create blur shorthand
 */
export function blur(px: number): string {
  return `blur(${rem(px)})`
}
