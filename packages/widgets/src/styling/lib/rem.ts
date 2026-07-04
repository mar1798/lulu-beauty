/**
 * Convert px to rem
 * Treats incoming value as px
 * returns string with rem value
 */
export function convertRem(px: number): string {
  const ZERO = 0,
    PX_RATIO = 0.0625
  if (px === ZERO) {
    return '0'
  }
  return `${px * PX_RATIO}rem`
}

/**
 * Convert px to rem
 * Treats incoming value as px
 * returns string with rem value
 * Example usage: rem(16, 24, 32) => '1rem 1.5rem 2rem'
 */
export function rem(...px: number[]): string {
  return px.map(convertRem).join(' ')
}
