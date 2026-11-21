import { style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Купон: корешок и основная часть, между ними перфорация.
 *
 * Mobile first: корешок сверху, перфорация горизонтальная; с `md` корешок
 * встаёт слева фиксированной ширины, перфорация - вертикальная.
 *
 * Вырезы - не кружки цвета фона поверх карточки (фон страницы бывает разным),
 * а маски: каждая половина срезает четверти круга у своих углов со стороны
 * перфорации, вместе они дают полукруглые выемки. Маска срезала бы и
 * `box-shadow`, поэтому тень - `drop-shadow` на обёртке: он повторяет форму с
 * вырезами.
 */

const NOTCH = 12
const STUB_WIDTH = 260

/** Слой маски: половина элемента, у одного угла срезана четверть круга. */
const corner = (at: string, place: string, size: string): string =>
  `radial-gradient(circle ${rem(NOTCH)} at ${at}, transparent 98%, #000) ${place} / ${size} no-repeat`

export const container = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  minWidth: 0,
  borderRadius: vars.radius.xxl,
  filter: 'drop-shadow(0 4px 14px rgb(0 0 0 / 0.08))',
  ...media({
    md: { gridTemplateColumns: `${rem(STUB_WIDTH)} minmax(0, 1fr)` },
  }),
})

/** Недействующий код приглушён, но читается: по нему видно, почему он не подошёл. */
export const inactive = style({
  opacity: 0.72,
})

export const stub = style({
  ...flexColumn(8),
  justifyContent: 'center',
  minWidth: 0,
  padding: vars.space.lg,
  color: color.text('inverse'),
  backgroundColor: color.brand('600'),
  borderTopLeftRadius: vars.radius.xxl,
  borderTopRightRadius: vars.radius.xxl,
  borderBottom: `2px dashed ${color.surface('base')}`,
  mask: [corner('0 100%', 'left', '51% 100%'), corner('100% 100%', 'right', '51% 100%')].join(', '),
  ...media({
    md: {
      borderTopRightRadius: 0,
      borderBottomLeftRadius: vars.radius.xxl,
      borderBottom: 'none',
      borderRight: `2px dashed ${color.surface('base')}`,
      mask: [corner('100% 0', 'top', '100% 51%'), corner('100% 100%', 'bottom', '100% 51%')].join(
        ', '
      ),
    },
  }),
})

/** Серый корешок: у недействующего кода акцентной заливки нет. */
export const stubInactive = style({
  color: color.text('secondary'),
  backgroundColor: color.surface('sunken'),
})

export const stubLabel = style({
  font: font('12/18', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  opacity: 0.8,
})

export const codeRow = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  // Тап по копированию - 48px, поэтому ряд не ниже него.
  minHeight: rem(48),
})

export const code = style({
  font: font('20/28', 600),
  // Код читают и вводят глазами: моноширинные символы не путают «0» и «O» в строке.
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.12em',
  overflowWrap: 'anywhere',
  userSelect: 'all',
})

export const body = style({
  ...flexColumn(16),
  minWidth: 0,
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderBottomLeftRadius: vars.radius.xxl,
  borderBottomRightRadius: vars.radius.xxl,
  mask: [corner('0 0', 'left', '51% 100%'), corner('100% 0', 'right', '51% 100%')].join(', '),
  ...media({
    md: {
      borderBottomLeftRadius: 0,
      borderTopRightRadius: vars.radius.xxl,
      mask: [corner('0 0', 'top', '100% 51%'), corner('0 100%', 'bottom', '100% 51%')].join(', '),
    },
  }),
})

export const head = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

export const promotion = style({
  font: font('14/20'),
  color: color.text('muted'),
  overflowWrap: 'anywhere',
})

/** Факты в ряд с `sm`: на всю ширину купона колонка из трёх строк пустовала бы справа. */
export const facts = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: vars.space.md,
  margin: 0,
  ...media({
    sm: { gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' },
  }),
})

export const fact = style({
  ...flexColumn(2),
  minWidth: 0,
})

export const term = style({
  font: font('13/18'),
  color: color.text('muted'),
})

export const value = style({
  margin: 0,
  font: font('15/22'),
  color: color.text('primary'),
  overflowWrap: 'anywhere',
})

export const orderLink = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: '44px',
    font: font('14/20', 500),
    color: color.text('brand'),
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  focusVisibleRing(),
])
