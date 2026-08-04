import type { CSSProperties } from '@vanilla-extract/css'

/**
 * Single line ellipsis. Requires the element to have a constrained width.
 */
export function truncate(): CSSProperties {
  return {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

/**
 * Multiline ellipsis (line-clamp), used for product names and descriptions.
 */
export function lineClamp(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  }
}
