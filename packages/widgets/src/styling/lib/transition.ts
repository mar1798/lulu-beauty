import type { CSSProperties } from 'react'
import { trnDelayVar, trnEasingVar } from '../properties.css'
import { vars } from '../util/time'

type Kebab<T extends string, A extends string = ''> = T extends `${infer F}${infer R}`
  ? Kebab<R, `${A}${F extends Lowercase<F> ? '' : '-'}${Lowercase<F>}`>
  : A

/**
 * Helper function to create transition property
 */
export const transition = (...args: readonly Kebab<keyof CSSProperties>[]): string =>
  args.map(e => `${e} ${trnDelayVar} ${trnEasingVar}`).join(', ')

export const transitionTimed = (...args: readonly Kebab<keyof CSSProperties>[]): string =>
  args.map(e => `${e} ${vars.duration} ${vars.delay} ${trnEasingVar}`).join(', ')

/**
 * Helper function to create transition property
 */
export const transitionBounce = (...args: readonly Kebab<keyof CSSProperties>[]): string =>
  args.map(e => `${e} 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)`).join(', ')
