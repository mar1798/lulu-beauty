import type { CSSProperties } from '@vanilla-extract/css'
import { min, rem } from '../lib'

/**
 * Mixin which is used to define grid container.
 * Columns can be specified as a number (then it is converted to equal fractions)
 * or as a raw `grid-template-columns` value.
 */
export function grid(columns?: number | string, gap?: number): CSSProperties {
  return {
    display: 'grid',
    ...(columns !== undefined
      ? {
          gridTemplateColumns:
            typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns,
        }
      : {}),
    ...(gap !== undefined ? { gap: rem(gap) } : {}),
  }
}

/**
 * Responsive grid without media queries: as many columns as fit,
 * each at least `minItemWidth` px wide (but never wider than the container).
 * Used for the product grid.
 */
export function gridAutoFit(minItemWidth: number, gap?: number): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${min(rem(minItemWidth), '100%')}, 1fr))`,
    ...(gap !== undefined ? { gap: rem(gap) } : {}),
  }
}
