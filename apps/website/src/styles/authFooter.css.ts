import { style } from '@vanilla-extract/css'
import { flexColumn } from 'widgets/styling/mixin'

/** Несколько строк-ссылок под карточкой входа/регистрации, не одна. */
export const stack = style({
  ...flexColumn(8),
  alignItems: 'center',
})
