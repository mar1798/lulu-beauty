import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, panel as panelMixin } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Mobile first: секции — панели друг под другом на всю ширину, поля в одну
 * колонку. Пары полей (дата и время) и два баннера встают рядом только с `sm`.
 */
export const container = style({
  ...flexColumn(20),
  minWidth: 0,
  ...media({
    lg: { maxWidth: '56rem' },
  }),
})

export const panel = style({
  ...flexColumn(16),
  ...panelMixin(),
})

export const sectionTitle = style({
  margin: 0,
  font: font('18/28', 600),
  color: color.text('primary'),
})

export const pair = style({
  ...flexColumn(16),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
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
