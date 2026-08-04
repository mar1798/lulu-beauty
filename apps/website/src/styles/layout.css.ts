import { style } from '@vanilla-extract/css'
import { flexRow } from 'widgets/styling/mixin'
import { vars } from 'widgets/styling/theme'

/** Ряд кнопок под сообщением: на узком экране переносится, а не сжимает подписи. */
export const actions = style({
  ...flexRow(12),
  flexWrap: 'wrap',
  marginTop: vars.space.xs,
})
