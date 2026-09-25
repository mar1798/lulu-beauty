import { style } from '@vanilla-extract/css'
import { border, color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn } from '../../styling/mixin'
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

/**
 * Имя и телефон — гостю. В строку с `md`: два коротких поля друг под другом
 * растягивают форму настолько, что поле «что искали» уезжает за нижний край
 * выпадающего списка.
 */
export const contact = style({
  ...flexColumn(12),
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: rem(12),
    },
  }),
})
