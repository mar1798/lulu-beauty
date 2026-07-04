import { rem } from './rem'

interface IShadowResult {
  colorize: (s: string) => string
}

/**
 * Helper function to generate shadows for box-shadow and text-shadow
 * Place can be 'in' or 'out' and defines if shadow is inset or not
 * Sizes can be specified as numbers (then they will be converted to rem) or strings
 */
export function shadow(place: 'in' | 'out', ...sz: (string | number)[]): IShadowResult {
  return {
    colorize: s => {
      const sizes: string[] = sz.map(p => {
        if (typeof p === 'string') {
          return p
        }

        return rem(p)
      })

      return `${place === 'in' ? 'inset ' : ''}${sizes.join(' ')} ${s}`
    },
  }
}

export function uniteShadows(...shadows: string[]): string {
  return `${shadows.join(',')}`
}
