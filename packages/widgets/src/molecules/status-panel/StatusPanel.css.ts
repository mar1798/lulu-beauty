import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'
import { STATUS_PULSE_DURATION_MS } from '../../utils/motion'

/**
 * Панель держится сменой материала: белая поверхность с рамкой и тенью на
 * плоском холсте. Тень — единственная на первом экране и работает
 * указателем, а не украшением.
 */
export const container = style({
  ...flexColumn(8),
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
  /* На мобильном — во всю ширину под кнопками, от `md` — по содержимому. */
  width: '100%',
  ...media({
    md: { width: 'fit-content', maxWidth: '30vw' },
  }),
})

/** Рамка — часть тона: марочная в норме, тревожная на последних сутках. */
export const tone = styleVariants({
  brand: { border: border(1, color.brand('200')) },
  muted: { border: border(1, color.border('subtle')) },
  urgent: { border: border(1, color.danger('300')) },
})

export const label = style({
  ...flexRow(8),
  alignItems: 'center',
  font: font('12/16', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
})

export const labelTone = styleVariants({
  brand: { color: color.text('brand') },
  muted: { color: color.text('muted') },
  urgent: { color: color.text('danger') },
})

/**
 * Живая точка: «что-то происходит прямо сейчас». Пульс медленный —
 * `opacity` + `scale`, без layout-свойств; при `prefers-reduced-motion`
 * точка стоит: панель и без пульса читается меткой и рамкой.
 */
const pulse = keyframes({
  '0%': { opacity: 1, transform: 'scale(1)' },
  '50%': { opacity: 0.4, transform: 'scale(0.72)' },
  '100%': { opacity: 1, transform: 'scale(1)' },
})

export const dot = style({
  flexShrink: 0,
  width: rem(8),
  height: rem(8),
  borderRadius: vars.radius.circle,
  backgroundColor: color.brand('500'),
  animationName: pulse,
  animationDuration: `${STATUS_PULSE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
  ...media({ preferReducedMotion: { animation: 'none' } }),
})

export const content = style({
  color: color.text('primary'),
})
