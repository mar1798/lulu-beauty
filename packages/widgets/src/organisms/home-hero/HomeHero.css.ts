import { style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Мягкая марочная плашка со скруглением карточки — приём референса Ronas:
 * первый экран отделён от холста цветом, а не линией.
 */
export const container = style({
  ...flexColumn(32),
  padding: vars.space.xl,
  backgroundColor: color.brand('100'),
  borderRadius: vars.radius.xxl,
  ...media({
    md: { padding: vars.space.xxl },
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 320px',
      gap: vars.space.xxl,
      alignItems: 'center',
    },
  }),
})

export const body = style({
  ...flexColumn(16),
  maxWidth: '46ch',
})

export const eyebrow = style({
  font: font('12/16', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  /* `brand.700` по плашке `brand.100` — 5.98:1; семантический 600 дал бы 4.2:1. */
  color: color.brand('700'),
})

export const actions = style({
  display: 'flex',
  gap: rem(12),
  flexWrap: 'wrap',
  marginTop: vars.space.xs,
})

/**
 * Врезка со сбором — белая карточка поверх плашки: она несёт единственную
 * меняющуюся во времени величину на экране и должна читаться первой после
 * заголовка.
 */
export const aside = style({
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xl,
  boxShadow: vars.shadow.sm,
  ...media({
    lg: { minWidth: rem(280) },
  }),
})
