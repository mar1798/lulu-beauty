import { style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Мягкая марочная плашка — та же роль, что была у старой плашки героя:
 * отделить финальный блок от холста цветом, а не линией. `overflow: hidden`
 * и `position: relative` — под слот `DecorField`.
 */
export const container = style({
  position: 'relative',
  overflow: 'hidden',
  padding: vars.space.xl,
  backgroundColor: color.surface('soft'),
  borderRadius: vars.radius.xxl,
  ...media({
    md: { padding: vars.space.xxl },
  }),
})

/** Центр на мобильном, левый край от `md` — как и кнопки. */
export const body = style({
  ...flexColumn(16),
  position: 'relative',
  alignItems: 'center',
  textAlign: 'center',
  maxWidth: rem(640),
  marginInline: 'auto',
  ...media({
    md: {
      alignItems: 'flex-start',
      textAlign: 'left',
      marginInline: 0,
      maxWidth: rem(720),
    },
  }),
})

export const eyebrow = style({
  font: font('12/16', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  /* Как у героя: `brand.700` по марочной плашке — 5.98:1, 600 не проходит AA. */
  color: color.brand('700'),
})

/**
 * Display-кегль вне шкалы `Heading`: токены-строки с `clamp()`, поэтому
 * набирается отдельными свойствами, а не хелпером `font()`.
 */
export const title = style({
  fontFamily: vars.font.eloqua,
  fontWeight: 600,
  fontSize: vars.fontSize.displaySm,
  lineHeight: vars.lineHeight.displaySm,
  letterSpacing: vars.tracking.tight,
  color: color.text('primary'),
  textWrap: 'balance',
})

export const description = style({
  font: font('16/24'),
  color: color.text('secondary'),
  maxWidth: '52ch',
})

export const actions = style({
  ...flexRow(12),
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: vars.space.xs,
  ...media({
    md: { justifyContent: 'flex-start' },
  }),
})

export const note = style({
  font: font('13/18'),
  color: color.text('muted'),
})
