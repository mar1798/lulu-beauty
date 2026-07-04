import { globalStyle } from '@vanilla-extract/css'
import type { GlobalStyleRule } from '@vanilla-extract/css'

/**
 * Helper class to create nested styles (to create scoped styles)
 * It is used to mitigate vanilla-extract issue with nested styles
 */
class NestedHandler {
  private readonly rootClass: string

  public constructor(rootClass: string) {
    this.rootClass = rootClass
  }

  public nStyle(selector: string, style: GlobalStyleRule): this {
    const st = selector.split(',')

    st.forEach(item => {
      globalStyle(`.${this.rootClass} ${item.trim()}`, style)
    })

    return this
  }

  public className(): string {
    return this.rootClass
  }
}

/**
 * Helper function to add nested (scoped) styles to predefined local style
 */
export function nestedStyle(rootClass: string): NestedHandler {
  return new NestedHandler(rootClass)
}
