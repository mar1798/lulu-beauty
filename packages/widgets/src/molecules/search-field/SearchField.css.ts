import { style } from '@vanilla-extract/css'
import { calc } from '@vanilla-extract/css-utils'
import { rem } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  width: '100%',
  maxWidth: rem(420),
})

export const icon = style({
  fontSize: rem(18),
})

/** Кнопка очистки подтянута к правому краю поля. */
export const clear = style({
  marginRight: calc(vars.space.xs).negate().toString(),
})
