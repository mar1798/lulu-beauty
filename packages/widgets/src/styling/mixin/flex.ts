import type { CSSProperties } from '@vanilla-extract/css'
import { rem } from '../lib'

/**
 * Mixin which is used to define flex container with column flow
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/explicit-function-return-type
export function flexColumn(gap?: number) {
  return {
    display: 'flex',
    flexDirection: 'column',
    ...(gap !== undefined ? { rowGap: rem(gap) } : {}),
  } satisfies CSSProperties
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/explicit-function-return-type
export function flexRow(gap?: number) {
  return {
    display: 'flex',
    flexDirection: 'row',
    ...(gap !== undefined ? { columnGap: rem(gap) } : {}),
  } satisfies CSSProperties
}