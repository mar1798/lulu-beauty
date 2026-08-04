import { createTheme } from '@vanilla-extract/css'
import { vars } from './contract.css'
import { lightTokens } from './tokens'

export const lightTheme = lightTokens

export const lightThemeStyle = createTheme(vars, lightTheme)
