import type { CSSProperties, StyleRule } from '@vanilla-extract/css'
import { color, outline, rem } from '../lib'

const RING_WIDTH = 2,
  RING_OFFSET = 2

/**
 * Focus ring properties. Applied as is when the element is always focusable
 * (e.g. a custom control that draws its own ring).
 */
export function focusRing(ringColor: string = color.border('focus'), width = RING_WIDTH): CSSProperties {
  return {
    outline: outline(width, ringColor),
    outlineOffset: rem(RING_OFFSET),
  }
}

/**
 * The same ring, but scoped to `:focus-visible` — the default for every
 * interactive element, so that a mouse click does not light the ring up.
 */
export function focusVisibleRing(
  ringColor: string = color.border('focus'),
  width = RING_WIDTH,
): StyleRule {
  return {
    selectors: {
      '&:focus-visible': focusRing(ringColor, width),
    },
  }
}
