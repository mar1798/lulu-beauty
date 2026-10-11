import { style } from '@vanilla-extract/css'
import { border, color, rem, transition } from '../../styling/lib'
import { flexColumn, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(16),
  padding: vars.space.lg,
  backgroundColor: color.surface('muted'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xxl,
})

/**
 * Тесный вид: форма стоит внутри выпадающего списка поиска, а не на странице.
 *
 * Своей карточки там быть не должно — список уже нарисован карточкой, и вторая
 * рамка внутри первой читается как чужой блок, случайно попавший в подсказки.
 * Остаётся одна линия сверху: она отделяет форму от «ничего не нашлось».
 */
export const compact = style({
  gap: rem(12),
  padding: `${vars.space.sm} ${vars.space.xs} ${vars.space.xs}`,
  backgroundColor: 'transparent',
  border: 'none',
  borderTop: border(1, color.border('subtle')),
  borderRadius: 0,
})

export const heading = style({
  ...flexColumn(4),
})

/** Ссылка на прямой контакт у гостя — как в пустой выдаче `HeaderSearch`. */
export const contactLink = style([
  {
    color: color.text('brand'),
    textDecoration: 'underline',
    borderRadius: vars.radius.sm,
    transition: transition('color'),
    ':hover': {
      color: color.brand('700'),
    },
  },
  focusVisibleRing(),
])
