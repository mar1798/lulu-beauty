import { style } from '@vanilla-extract/css'
import { calc } from '@vanilla-extract/css-utils'
import { vars } from '../../styling/themes/contract.css'

/** Кнопка «показать пароль» подтянута к правому краю поля. */
export const toggle = style({
  marginRight: calc(vars.space.xs).negate().toString(),
})
