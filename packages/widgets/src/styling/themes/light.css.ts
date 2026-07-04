import { createTheme } from '@vanilla-extract/css'
import { vars } from './contract.css'

export const lightTheme = {
  color: {
    neutral: {
    },
  },
  font: {
    inter: `var(--font-inter, Inter, sans-serif)`,
    eloqua: `var(--font-eloqua, Eloqua, sans-serif)`,
  },
} as const

export const lightThemeStyle = createTheme(vars, lightTheme)
