import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing, tagRow, tagSeparator } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * До `sm` строка ломается на две: сверху миниатюра с описанием позиции, снизу —
 * управление и сумма. С `sm` всё возвращается в одну строку.
 *
 * В одну строку на узком экране степпер с крестиком и сумма делили остаток
 * ширины с названием, и этот остаток зависел от длины суммы: у дорогой позиции
 * степпер ужимался сильнее, чем у дешёвой, — соседние строки списка выглядели
 * по-разному. Своя строка даёт управлению всю ширину карточки, поэтому его
 * геометрия от цен больше не зависит.
 */
export const container = style({
  display: 'grid',
  gridTemplateAreas: `
    "thumb body"
    "footer footer"
  `,
  gridTemplateColumns: '64px minmax(0, 1fr)',
  columnGap: '16px',
  rowGap: vars.space.sm,
  alignItems: 'start',
  paddingBlock: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
  ...media({
    sm: {
      gridTemplateAreas: '"thumb body footer"',
      gridTemplateColumns: '64px minmax(0, 1fr) auto',
      rowGap: 0,
    },
  }),
})

export const thumb = style({
  gridArea: 'thumb',
  position: 'relative',
  flexShrink: 0,
  width: '64px',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
})

export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: color.text('subtle'),
})

export const body = style({
  gridArea: 'body',
  ...flexColumn(6),
  minWidth: 0,
})

export const name = style([
  {
    color: color.text('primary'),
    textDecoration: 'none',
  },
  focusVisibleRing(),
])

/**
 * Вторая строка карточки: слева управление, справа сумма позиции.
 *
 * До `sm` занимает всю ширину, с `sm` возвращается в правую колонку одной
 * строкой — на широком экране ломать карточку не за что.
 */
export const footer = style({
  gridArea: 'footer',
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  ...media({
    sm: { justifyContent: 'flex-end', gap: vars.space.md },
  }),
})

/** Метки под ценой: марка, категория, объём — как в карточке каталога. */
export const tags = style(tagRow())

export const tag = style(tagSeparator())

/** Строка «2 шт × цена» — режим без правки (оформление, закрытый сбор). */
export const meta = style({
  ...flexRow(6),
  alignItems: 'baseline',
  flexWrap: 'wrap',
})

/**
 * Степпер и крестик в режиме правки.
 *
 * Крестик не переносится: он относится к количеству рядом с ним, а уехав на
 * строку ниже, читался бы как действие над всей позицией.
 */
export const controls = style({
  ...flexRow(8),
  alignItems: 'center',
  flexWrap: 'nowrap',
  ...media({
    sm: { gap: vars.space.sm },
  }),
})

export const total = style({
  flexShrink: 0,
  textAlign: 'right',
  ...media({
    md: { minWidth: '120px' },
  }),
})
