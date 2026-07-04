import { breakpoints } from '../breakpoints'
import { rem } from '../styling/lib'

type IBpKey = keyof typeof breakpoints
type ISizeValue = number | string
export type ISizes = Partial<Record<IBpKey, ISizeValue>> & { fb: ISizeValue }

/**
 * Extracts size value from string or number. It converts number from px to rem,
 * but keeps string as is.
 */
function extractValue(value: string | number): string {
  return typeof value === 'string' ? value : rem(value)
}

/**
 * Convert ISizes to string, which can be used as a value for img `sizes` attribute
 */
export function extractSizes(input: ISizes): string {
  const result: [number, string][] = []

  for (const [key, value] of Object.entries(input)) {
    if (key === 'fb') {
      continue
    }

    const k = key as IBpKey
    const v = extractValue(value)
    result.push([breakpoints[k], v])
  }

  if (result.length) {
    result.sort((a, b) => b[0] - a[0])
    const media = result.map(i => `(min-width: ${rem(i[0])}) ${i[1]}`).join(', ')
    return `${media}, ${extractValue(input.fb)}`
  }

  return extractValue(input.fb)
}
