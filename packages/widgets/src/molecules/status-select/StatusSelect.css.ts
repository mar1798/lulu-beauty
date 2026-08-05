import { style } from '@vanilla-extract/css'
import { rem } from '../../styling/lib'

export const container = style({
  /* В строке таблицы поле не должно растягиваться на всю ячейку. */
  minWidth: rem(210),
})
