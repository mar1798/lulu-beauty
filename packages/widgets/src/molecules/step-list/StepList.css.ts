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
  ...flexRow(16),
  alignItems: 'flex-start',
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.sm,
})

/**
 * Номер в кружке: он же единственная «графика» блока. Подложка `brand.700`,
 * а не 500: белым по 500 выходит 3.35:1, по 700 — 6.8:1.
 */
export const number = style({
  ...flexRow(),
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: rem(36),
  height: rem(36),
  font: font('16/20', 600, 'eloqua'),
  color: color.text('inverse'),
  backgroundColor: color.brand('700'),
  borderRadius: vars.radius.circle,
})

export const body = style({
  ...flexColumn(6),
  minWidth: 0,
})
