import { createThemeContract } from '@vanilla-extract/css'
import { lightTokens } from './tokens'

/**
 * Контракт темы. Строится из `lightTokens`: `createThemeContract` смотрит
 * только на форму объекта, значения листьев игнорируются и заменяются на
 * `var(--…)`. Благодаря этому контракт и тема не могут разъехаться ключами.
 */
export const vars = createThemeContract(lightTokens)
