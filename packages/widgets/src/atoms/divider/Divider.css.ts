import { style, styleVariants } from '@vanilla-extract/css'
import { color } from '../../styling/lib'

export const container = style({
  border: 'none',
  backgroundColor: color.border('subtle'),
  margin: 0,
})

export const orientation = styleVariants({
  horizontal: { width: '100%', height: '1px' },
  vertical: { width: '1px', alignSelf: 'stretch' },
})
