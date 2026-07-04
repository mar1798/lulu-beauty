import { breakpoints } from '../breakpoints'
import { rem } from '../styling/lib'

export type DesignBreakpoints = keyof typeof breakpoints

export function responsiveMap(
  matcher: (bp: DesignBreakpoints) => boolean
): Record<DesignBreakpoints, boolean> {
  return Object.keys(breakpoints).reduce((carry, key) => {
    const k = key as DesignBreakpoints
    carry[k] = matcher(k)
    return carry
    // eslint-disable-next-line @typescript-eslint/prefer-reduce-type-parameter
  }, {} as Record<DesignBreakpoints, boolean>)
}

export function responsiveMatcher(bp: DesignBreakpoints): boolean {
  const query = `(min-width: ${rem(breakpoints[bp])})`
  return window.matchMedia(query).matches
}
