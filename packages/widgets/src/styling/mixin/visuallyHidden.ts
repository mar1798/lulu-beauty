import type { CSSProperties } from '@vanilla-extract/css'

/**
 * Hides an element visually while keeping it available to screen readers.
 * Base for the `VisuallyHidden` atom and for labels of icon-only controls.
 */
export function visuallyHidden(): CSSProperties {
  return {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  }
}
