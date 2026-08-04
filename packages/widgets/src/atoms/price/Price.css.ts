import { style, styleVariants } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  color: color.text('primary'),
  whiteSpace: 'nowrap',
})

export const size = styleVariants({
  sm: { font: font('14/20', 500) },
  md: { font: font('16/24', 600) },
  lg: { font: font('24/32', 600), letterSpacing: vars.tracking.display },
})
