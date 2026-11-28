import { style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow, gridAutoFit } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Шагов всегда немного (три-четыре), поэтому колонок ровно столько, сколько
 * влезает: медиа-запросы здесь были бы лишней настройкой.
 */
export const container = style({
  ...gridAutoFit(240, 24),
  listStyle: 'none',
})

export const item = style({
  ...flexColumn(12),
  position: 'relative',
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.sm,
})

/**
 * Слот иконки шага (сезонный декор): правый верхний угол карточки, на 16 px
 * над её краем. Абсолют - в потоке слот ничего не занимает, поэтому иконка,
 * пришедшая после гидратации, не сдвигает ни шаги, ни страницу. Пустой слот
 * (вне сезона декор отдаёт `null`) скрыт.
 */
export const icon = style({
  position: 'absolute',
  top: rem(-16),
  right: vars.space.md,
  zIndex: 1,
  pointerEvents: 'none',
  selectors: {
    '&:empty': { display: 'none' },
  },
})

/** Строка «номер + заголовок» под сценой. */
export const heading = style({
  ...flexRow(12),
  alignItems: 'center',
})

/**
 * Номер в кружке — единственная «графика» шага помимо сцены. Подложка
 * `brand.700`, а не 500: белым по 500 выходит 3.35:1, по 700 — 6.8:1.
 */
export const number = style({
  ...flexRow(),
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: rem(32),
  height: rem(32),
  font: font('15/20', 600, 'display'),
  color: color.text('inverse'),
  backgroundColor: color.brand('700'),
  borderRadius: vars.radius.circle,
})
