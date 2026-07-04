import { rem } from './rem'

interface IShadowResult {
  colorize: (s: string) => string
}

/**
 * Helper function to generate shadows for box-shadow and text-shadow
 * Sizes can be specified as numbers (then they will be converted to rem) or strings
 */
export function dropShadow(...sz: (string | number)[]): IShadowResult {
  return {
    colorize: s => {
      const sizes: string[] = sz.map(p => {
        if (typeof p === 'string') {
          return p
        }

        return rem(p)
      })

      return `drop-shadow(${sizes.join(' ')} ${s})`
    },
  }
}

export function uniteDropShadows(...shadows: string[]): string {
  return `${shadows.join(' ')}`
}
