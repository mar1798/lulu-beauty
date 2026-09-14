import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'
import { APPEAR_DURATION_MS, APPEAR_OFFSET } from '../../utils/motion'

/**
 * Появление на CSS, а не на Motion, — по той же причине, что у `Appear`, и
 * причина здесь измерена.
 *
 * У Motion начальное состояние уезжает в серверную разметку, поэтому врезка
 * приезжала к человеку с `opacity:0` и ждала гидратации. На `/catalog` врезка
 * «Приём заказов закрыт» стоит выше сгиба и оказывалась самым крупным
 * элементом первого экрана: невидима с 1368 до 2617 мс на 4× CPU + Slow 4G,
 * LCP 3389 мс при FCP 1479 мс. CSS-анимация играет с первой же отрисовки и от
 * JS не зависит вовсе — а врезка, показанная в ответ на действие, всё так же
 * проявляется, потому что узел рождается в этот момент.
 */
const rise = keyframes({
  from: { opacity: 0, transform: `translateY(${APPEAR_OFFSET}px)` },
  to: { opacity: 1, transform: 'translateY(0)' },
})

/** При `prefers-reduced-motion` остаётся одна прозрачность — движение убирается. */
const fade = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

export const container = style({
  ...flexRow(12),
  alignItems: 'flex-start',
  padding: `${vars.space.sm} ${vars.space.md}`,
  border: border(1, 'transparent'),
  borderRadius: vars.radius.xl,
  animationName: rise,
  animationDuration: `${APPEAR_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  /*
    `will-change` не ставим: анимируются `opacity` и `transform`, слой браузер
    поднимает сам (см. `best-practices` скилла `/motion`).
  */
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animationName: fade,
    },
  },
})

export const tone = styleVariants({
  info: {
    backgroundColor: color.info('100'),
    borderColor: color.info('300'),
    color: color.info('700'),
  },
  success: {
    backgroundColor: color.success('100'),
    borderColor: color.success('300'),
    color: color.success('700'),
  },
  warning: {
    backgroundColor: color.warning('100'),
    borderColor: color.warning('300'),
    color: color.warning('700'),
  },
  danger: {
    backgroundColor: color.danger('100'),
    borderColor: color.danger('300'),
    color: color.danger('700'),
  },
})

export const body = style(flexColumn(4))

export const title = style({
  font: font('16/24', 600),
})

export const message = style({
  font: font('14/20'),
})

export const action = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  marginTop: vars.space.xs,
})

export const close = style({
  marginLeft: 'auto',
  marginTop: rem(-4),
  marginRight: rem(-8),
  color: 'inherit',
})
