import { style } from '@vanilla-extract/css'

/**
 * Обёртке хватает собственного блока: transform ставит motion инлайном, а
 * `will-change` не нужен — motion промотирует слой сам на время движения.
 */
export const container = style({})
