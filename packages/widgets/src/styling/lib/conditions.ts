type IString = string | { toString: () => string }

/**
 * Helper function, wraps css max function
 */
export function max(a: IString, b: IString): string {
  return `max(${a.toString()}, ${b.toString()})`
}

/**
 * Helper function, wraps css min function
 */
export function min(a: IString, b: IString): string {
  return `min(${a.toString()}, ${b.toString()})`
}

/**
 * Helper function, wraps css clamp function
 */
export function clamp(minimum: string, preferred: IString, maximum: string): string {
  return `clamp(${minimum}, ${preferred.toString()}, ${maximum})`
}
