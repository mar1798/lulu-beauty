import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Mobile first: секции — панели друг под другом на всю ширину, поля в одну
 * колонку. Пары полей (дата и время) и два баннера встают рядом только с `sm`.
 * Ширину форма не ограничивает: она идёт вровень с шапкой страницы и её кнопками.
 */
export const container = style({
  ...flexColumn(20),
  minWidth: 0,
})

export const switches = style(flexColumn(8))

/** Два баннера: на телефоне друг под другом, с `lg` — рядом (на `sm` превью слишком широки для пары). */
export const banners = style({
  ...flexColumn(24),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

export const actions = style({
  ...flexColumn(8),
  ...media({
    sm: { ...flexRow(8), flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  }),
})
