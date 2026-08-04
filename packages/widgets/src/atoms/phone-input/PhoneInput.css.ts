import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'

/** Код страны — статичный префикс, а не часть значения поля. */
export const dialCode = style({
  font: font('15/22', 500),
  color: color.text('secondary'),
})
