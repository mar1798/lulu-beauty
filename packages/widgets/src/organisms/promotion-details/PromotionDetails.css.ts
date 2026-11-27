import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  minWidth: 0,
  ...media({
    md: { ...flexColumn(32) },
  }),
})

/** Рамка баннера: пропорции как у карусели (`BANNER_SPECS`) - 3:2 на телефоне, 3:1 с `md`. */
export const banner = style({
  aspectRatio: '3 / 2',
  overflow: 'hidden',
  borderRadius: vars.radius.xxl,
  ...media({
    md: { aspectRatio: '3 / 1' },
  }),
})

export const image = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

export const head = style({
  ...flexColumn(8),
})

export const section = style({
  ...flexColumn(12),
})

export const list = style({
  ...flexColumn(8),
  margin: 0,
  paddingLeft: vars.space.lg,
})

/**
 * Строка промокода за участие: что даёт, а под ним - срок и условия кода. Блочные
 * строки, а не flex у самого `<li>`: flex отнял бы у пункта маркер списка.
 */
export const codeLine = style({
  display: 'block',
  marginTop: vars.space.xxs,
})

export const actions = style({
  display: 'flex',
})
