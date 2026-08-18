import { style, styleVariants } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(8),
  alignItems: 'baseline',
  flexWrap: 'wrap',
})

export const label = style({
  font: font('14/20'),
  color: color.text('secondary'),
})

export const value = style({
  font: font('16/22', 600),
  fontVariantNumeric: 'tabular-nums',
  color: color.text('primary',),
})

export const tone = styleVariants({
  normal: {},
  /** Меньше суток — подсвечиваем: после дедлайна заявку уже не оформить. */
  urgent: { color: color.text('danger') },
  expired: { color: color.text('muted') },
})

export const placeholder = style({
  display: 'inline-block',
  width: rem(120),
  height: rem(20),
  borderRadius: vars.radius.pill,
  backgroundColor: color.neutral('200'),
})

/* --- Вариант `blocks`: крупные блоки для панели героя --- */

export const containerBlocks = style({
  ...flexColumn(4),
})

export const blocks = style({
  ...flexRow(),
  alignItems: 'stretch',
})

export const block = style({
  ...flexColumn(2),
  alignItems: 'center',
  paddingInline: vars.space.md,
  selectors: {
    /* Крайние блоки не отъезжают от рамки панели дальше её паддинга. */
    '&:first-child': { paddingLeft: 0 },
    '&:last-child': { paddingRight: 0 },
  },
})

/** Волосяной вертикальный разделитель между блоками. */
export const blockDivided = style({
  borderLeft: `1px solid ${color.border('subtle')}`,
})

/**
 * Цифра — display-токенами, а не хелпером `font()`: кегль со `clamp()`.
 * `tabular-nums` обязателен — без него панель дёргается по ширине каждую
 * минуту.
 */
export const digit = style({
  fontFamily: vars.font.eloqua,
  fontWeight: 600,
  fontSize: vars.fontSize.counter,
  lineHeight: vars.lineHeight.displaySm,
  letterSpacing: vars.tracking.display,
  fontVariantNumeric: 'tabular-nums',
  color: color.text('primary'),
})

/** Меньше суток: семантика та же, что у inline-варианта. */
export const digitUrgent = style({
  color: color.text('danger'),
})

export const unit = style({
  font: font('11/14', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  color: color.text('muted'),
})

/** Заглушка до гидратации — в габаритах блочной строки, чтобы не прыгало. */
export const placeholderBlocks = style({
  width: rem(200),
  height: rem(56),
  borderRadius: vars.radius.lg,
})
