import { rem } from './rem'

/**
 * Helper function to create border shorthand
 */
export function border(width: number, color: string, type = 'solid'): string {
  return `${rem(width)} ${type} ${color}`
}
