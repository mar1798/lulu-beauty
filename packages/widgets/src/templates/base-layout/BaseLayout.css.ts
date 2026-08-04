import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(),
  minHeight: '100vh',
})

export const main = style({
  flex: 1,
  width: '100%',
})

/**
 * Ссылка «к содержимому»: спрятана, пока не получит фокус с клавиатуры.
 * Без неё каждый переход по страницам начинается с прохода по всей шапке.
 */
export const skipLink = style({
  position: 'absolute',
  left: vars.space.md,
  top: vars.space.md,
  zIndex: vars.zIndex.toast,
  padding: `${vars.space.xs} ${vars.space.md}`,
  font: font('14/20', 500),
  color: color.text('inverse'),
  backgroundColor: color.neutral('900'),
  borderRadius: vars.radius.pill,
  transform: 'translateY(-200%)',
  selectors: {
    '&:focus-visible': { transform: 'translateY(0)' },
  },
})
