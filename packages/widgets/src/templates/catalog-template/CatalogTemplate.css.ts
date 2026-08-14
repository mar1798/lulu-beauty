import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Между крупными блоками каталога — 48px: макет должен «дышать». */
export const container = style({
  ...flexColumn(48),
  paddingBlock: vars.space.xxl,
})

export const head = style(flexColumn(8))

/**
 * Фильтры и поиск выровнены по **нижнему** краю, а не по верхнему: у списков
 * над полем стоит подпись, у поиска её нет, и по верхнему краю его «пилюля»
 * поднималась выше остальных — три поля в ряд читались как ступенька. По
 * нижнему краю сами поля стоят на одной линии, а подписи просто висят над
 * своими.
 */
export const controls = style({
  ...flexColumn(16),
  ...media({
    md: {
      ...flexRow(24),
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
  }),
})

export const pagination = style({
  marginTop: vars.space.sm,
})
