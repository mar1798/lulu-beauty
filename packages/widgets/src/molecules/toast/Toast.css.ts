import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(12),
  alignItems: 'flex-start',
  width: '100%',
  maxWidth: rem(380),
  padding: `${vars.space.sm} ${vars.space.md}`,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
  boxShadow: vars.shadow.lg,
  /* Тост всплывает над затемнением модалки — иначе результат действия из неё не виден. */
  pointerEvents: 'auto',
})

/**
 * Тон — узкой полосой слева, а не заливкой всего блока: тост висит поверх
 * содержимого страницы, и сплошной цветной прямоугольник на ней кричит.
 */
export const tone = styleVariants({
  info: { borderLeft: border(4, color.info('500')) },
  success: { borderLeft: border(4, color.success('500')) },
  danger: { borderLeft: border(4, color.danger('500')) },
})

export const body = style({
  ...flexColumn(2),
  minWidth: 0,
})

export const title = style({
  font: font('15/22', 600),
  color: color.text('primary'),
})

export const description = style({
  font: font('14/20'),
  color: color.text('secondary'),
})

export const close = style({
  marginLeft: 'auto',
  marginRight: rem(-8),
})
