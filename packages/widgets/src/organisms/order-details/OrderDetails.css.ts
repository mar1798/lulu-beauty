import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(16),
  padding: vars.space.xl,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
})

export const head = style({
  ...flexRow(16),
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

export const headMain = style({
  ...flexColumn(4),
})

export const note = style({
  ...flexColumn(4),
  padding: vars.space.md,
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.xl,
})

export const noteActions = style({
  ...flexRow(8),
  alignItems: 'center',
  flexWrap: 'wrap',
  marginTop: vars.space.xs,
})

export const items = style({
  ...flexColumn(0),
})

/**
 * Решение о судьбе заявки целиком — отмена или её возврат — стоит после итога
 * и отделено линией: попасть в него случайно, целясь в степпер, нельзя. Оба
 * состояния делят одно место: заявка либо в работе, либо отменена.
 */
export const footer = style({
  ...flexColumn(12),
  alignItems: 'flex-start',
  paddingTop: vars.space.md,
  borderTop: border(1, color.border('subtle')),
})

export const totalRow = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
})

/** Скелетон позиции повторяет геометрию `OrderItemRow`: миниатюра и две строки. */
export const skeletonRow = style({
  ...flexRow(16),
  alignItems: 'flex-start',
  paddingBlock: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
})

export const skeletonThumb = style({
  flexShrink: 0,
  aspectRatio: '4 / 5',
})

export const skeletonLines = style({
  ...flexColumn(10),
  flex: 1,
  minWidth: 0,
})
