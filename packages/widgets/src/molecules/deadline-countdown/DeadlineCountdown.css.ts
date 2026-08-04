import { style, styleVariants } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(8),
  alignItems: 'baseline',
  flexWrap: 'wrap',
})

export const label = style({
  font: font('14/20'),
  color: color.text('secondary'),
})

export const value = style({
  font: font('16/22', 600),
  fontVariantNumeric: 'tabular-nums',
  color: color.text('primary',),
})

export const tone = styleVariants({
  normal: {},
  /** Меньше суток — подсвечиваем: после дедлайна заявку уже не оформить. */
  urgent: { color: color.text('danger') },
  expired: { color: color.text('muted') },
})

export const placeholder = style({
  display: 'inline-block',
  width: rem(120),
  height: rem(20),
  borderRadius: vars.radius.xs,
  backgroundColor: color.neutral('200'),
})
