import { style } from '@vanilla-extract/css'
import { border, color, min, rem } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { wrapperWidth } from '../../styling/properties.css'
import { vars } from '../../styling/themes/contract.css'

/**
 * Колонка в 680px, а не во всю ширину контейнера: документ читают строками, а
 * строка в полторы тысячи пикселей теряется на возврате к началу следующей.
 *
 * Сужение — через `min` с `wrapperWidth`, а не голым `rem(680)`: поля страницы
 * зашиты в саму переменную (`min(100vw - 40px, 1200px)`), и плоское число их
 * затирает — на экране уже 680px текст вставал впритык к краям.
 */
export const container = style({
  ...flexColumn(32),
  maxWidth: min(wrapperWidth, rem(680)),
  paddingBlock: vars.space.xxl,
})

export const head = style({
  ...flexColumn(8),
  paddingBottom: vars.space.lg,
  borderBottom: border(1, color.border('subtle')),
})

export const sections = style(flexColumn(28))

export const section = style(flexColumn(10))

/**
 * Маркер — свой, псевдоэлементом: `list-style` в preflight снят на весь
 * документ, а возвращать его одному списку — значит зависеть от того, что
 * браузер под ним понимает.
 */
export const list = style({
  ...flexColumn(6),
  paddingLeft: vars.space.md,
})

export const listItem = style({
  position: 'relative',
  paddingLeft: vars.space.md,
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      /* Кружок ловится на середину первой строки, а не на её верх. */
      top: rem(9),
      width: rem(4),
      height: rem(4),
      borderRadius: '50%',
      backgroundColor: color.border('strong'),
    },
  },
})

export const footer = style({
  ...flexColumn(8),
  paddingTop: vars.space.lg,
  borderTop: border(1, color.border('subtle')),
})
