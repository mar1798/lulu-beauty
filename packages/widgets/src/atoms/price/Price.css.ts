import { style, styleVariants } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'

export const container = style({
  color: color.text('primary'),
  whiteSpace: 'nowrap',
})

export const size = styleVariants({
  sm: { font: font('14/20', 500) },
  md: { font: font('17/24', 600) },
  lg: { font: font('24/32', 600) },
})
