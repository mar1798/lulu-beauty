import { style } from '@vanilla-extract/css'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** 64px между секциями главной — на шаг больше, чем внутри каталога (48px). */
export const container = style({
  ...flexColumn(64),
  paddingBlock: vars.space.xxl,
})
