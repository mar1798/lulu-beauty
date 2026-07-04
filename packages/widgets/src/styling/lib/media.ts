import type { StyleRule } from '@vanilla-extract/css'
import { rem } from './rem'
import { breakpoints } from '../../breakpoints'

const queries = {
  // hover: '(hover: hover)',
  // hoverAnimatable: '(hover: hover) and (not (prefers-reduced-motion))',
  hoverAnimatable: '(hover: hover)',
  preferMotion: '(not (prefers-reduced-motion))',
  preferReducedMotion: '(prefers-reduced-motion)',
  keyboard: '(hover: hover) and (pointer: fine)',
} as const

type IMedia = StyleRule['@media'] extends infer T | undefined ? T : never

interface IMediaQuery {
  '@media': IMedia
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IMediaValue = IMedia extends Record<any, infer V> ? V : never
type IMediaKeys = keyof typeof queries | keyof typeof breakpoints
type IMediaRequest = Record<IMediaKeys, IMediaValue>

/**
 * Media query generator
 * returns object with @media key
 * Accepts object with keys which can be design breakpoints or custom defined media queries
 */
export function media(request: Partial<IMediaRequest>): IMediaQuery {
  const result: Record<string, IMediaValue> = {}

  for (const key of Object.getOwnPropertyNames(request)) {
    const resVal = request[key as keyof typeof request]
    if (!resVal) {
      continue
    }

    if (key in queries) {
      const rKey = queries[key as keyof typeof queries]
      result[rKey] = resVal
      continue
    }
    if (key in breakpoints) {
      const rKey = `screen and (min-width: ${rem(breakpoints[key as keyof typeof breakpoints])})`
      result[rKey] = resVal
      continue
    }
  }

  return {
    '@media': result,
  }
}
