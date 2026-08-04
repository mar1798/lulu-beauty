import { style } from '@vanilla-extract/css'
import { border, color, font, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing, gridAutoFit } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Тёмная полоса в основании страницы — часть схемы: холст остаётся светлым,
 * а подвал закрывает его сплошным чернильным блоком без рамки сверху.
 */
export const container = style({
  marginTop: 'auto',
  backgroundColor: color.background('inverse'),
})

export const inner = style({
  ...flexColumn(32),
  paddingBlock: vars.space.xxxl,
})

export const columns = style(gridAutoFit(200, 24))

export const column = style(flexColumn(10))

export const title = style({
  font: font('14/20', 600),
  color: color.text('inverse'),
  textTransform: 'uppercase',
  letterSpacing: vars.tracking.wide,
})

/** На тёмном ссылки ведёт нейтральный 400, а наведение — пастельная марка. */
export const link = style([
  {
    font: font('14/22'),
    color: color.neutral('400'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.brand('300') },
    },
  },
  focusVisibleRing(color.brand('300')),
])

export const bottom = style({
  ...flexColumn(8),
  paddingTop: vars.space.lg,
  borderTop: border(1, color.border('inverse')),
  ...media({
    md: {
      ...flexRow(16),
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  }),
})

export const note = style({
  font: font('12/20'),
  color: color.neutral('400'),
})
