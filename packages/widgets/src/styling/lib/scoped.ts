import { globalStyle, type GlobalStyleRule, style, type StyleRule } from '@vanilla-extract/css'

/**
 * Helper class to create nested styles (to create scoped styles)
 * It is used to mitigate vanilla-extract issue with nested styles
 */
class NestedHandler {
  private readonly rootClass: string

  public constructor(rootClass: string) {
    this.rootClass = rootClass
  }

  public style(selector: string, css: GlobalStyleRule): this {
    const st = selector.split(',')

    st.forEach(item => {
      globalStyle(`.${this.rootClass} ${item.trim()}`, css)
    })

    return this
  }

  public toString(): string {
    return this.rootClass
  }
}

/**
 * Helper function to add nested (scoped) styles to predefined local style
 */
export function inScopeOf(rootClass: string): NestedHandler {
  return new NestedHandler(rootClass)
}

export function scopedStyle(className: string, css: StyleRule): string {
  return style({
    selectors: {
      [`${className} &`]: css,
    },
  })
}
