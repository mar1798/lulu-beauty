/* eslint-disable @typescript-eslint/prefer-reduce-type-parameter */
import Color from 'color'
import { vars } from '../themes/contract.css'

/**
 * Prepares color for rgba() function (used for convenience when defining colors in vars)
 */
export const prepColor = (color: string): string => {
  const c = Color(`#${color}`)
  return c.array().join(',')
}

type IColorGetterList<T = typeof vars.color> = {
  [K in keyof T]: (shade: keyof T[K], alpha?: number | string) => string
}

/**
 * List of color getters. Each getter returns color in rgb() or rgba() format.
 * If alpha is not specified, rgb() is returned.
 * If alpha is specified as number, it is treated as value from 0 to 1
 * If alpha is specified as string, it is treated as is.
 * Available colors are defined in a theme contract vars.color
 */
export const color = Object.keys(vars.color).reduce((acc, colorKey) => {
  const key = colorKey as keyof typeof vars.color
  // @ts-ignore
  acc[key] = (shade: string, alpha = 1): string => {
    const s = shade as keyof (typeof vars.color)[typeof key]
    const colorVar = vars.color[key][s] as string

    if (alpha === 1) {
      return `rgb(${colorVar})`
    }
    return `rgba(${colorVar},${alpha})`
  }

  return acc
}, {} as IColorGetterList)
