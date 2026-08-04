import type { CSSProperties } from '@vanilla-extract/css'
import { wrapperPadding, wrapperWidth } from '../properties.css'

/**
 * Content wrapper: centered block of `wrapperWidth` (see `global.css.ts`,
 * `min(100vw - 40px, 1128px)` — gutters are already accounted for there,
 * so no extra horizontal padding is needed).
 */
export function container(): CSSProperties {
  return {
    width: '100%',
    maxWidth: wrapperWidth,
    marginInline: 'auto',
  }
}

/**
 * For full-bleed sections: the background spans the whole viewport while the
 * content stays aligned with `container()`.
 */
export function containerPadding(): CSSProperties {
  return {
    paddingInline: wrapperPadding,
  }
}
