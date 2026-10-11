import { style } from '@vanilla-extract/css'
import { flexColumn } from '../../styling/mixin'

/** Собственных размеров у окна нет — их задаёт `Modal size="sm"`. */
export const container = style({})

export const body = style(flexColumn(16))
