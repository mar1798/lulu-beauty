import { rem } from './rem'
import { vars } from '../themes/contract.css'

type Size = `${number}` | `${number}/${number}`
type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
type Family = keyof (typeof vars)['font']

export function fontFamily(family: Family): string {
  return vars.font[family]
}

/**
 * Helper function to create font shorthand.
 * Size can be specified as number (then line will be same with size) or string in format 'size/line'.
 * Weight can be specified as number
 * Family can be specified by one of the strings 'sans' | 'mono'.
 */
export function font(size: Size | number, weight: Weight = 400, family: Family = 'inter'): string {
  if (typeof size === 'number' || /^\d+$/.test(size)) {
    const sizeInt = typeof size === 'number' ? size : parseInt(size, 10)
    return `${weight} ${rem(sizeInt)}/${rem(sizeInt)} ${fontFamily(family)}`
  }

  const parts = /^(\d+)\/(\d+)$/.exec(size)
  if (parts) {
    const sizeInt = parseInt(parts[1], 10),
      lineInt = parseInt(parts[2], 10)

    return `${weight} ${rem(sizeInt)}/${rem(lineInt)} ${fontFamily(family)}`
  }

  throw new Error('Unsupported font size: ' + size.toString())
}
