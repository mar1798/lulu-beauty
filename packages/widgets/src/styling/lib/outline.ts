import { rem } from './rem'

/**
 * Helper function to create border shorthand
 */
export function outline(width: number, color: string): string {
  return `${rem(width)} solid ${color}`
}
