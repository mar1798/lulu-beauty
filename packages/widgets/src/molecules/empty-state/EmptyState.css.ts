import { style } from '@vanilla-extract/css'
import { color, media, rem } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  alignItems: 'center',
  textAlign: 'center',
  padding: `${vars.space.xxl} ${vars.space.md}`,
})

export const icon = style({
  fontSize: rem(40),
  color: color.text('subtle'),
})

/*
  Обёртка тянется во всю ширину на телефоне: сама кнопка растягивается своим
  `isFullWidth="mobile"`, но в колонке с `align-items: center` ей нечего
  заполнять — растягивать надо и место под неё. С `sm` — снова по содержимому.
*/
export const action = style({
  marginTop: vars.space.xs,
  alignSelf: 'stretch',
  ...media({
    sm: { alignSelf: 'center' },
  }),
})
