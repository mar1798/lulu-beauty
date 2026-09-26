import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Между крупными блоками каталога — 48px: макет должен «дышать». */
export const container = style({
  ...flexColumn(48),
  paddingBlock: vars.space.xxl,
})

/**
 * Заголовок и слот `aside` разведены по краям строки. До `sm` — столбцом:
 * таймер со своей подписью в узкую строку рядом с «Каталогом» не встаёт, и
 * перенос там честнее сжатия.
 *
 * Выравнивание по нижнему краю: у заголовка под ним стоит «Найдено товаров»,
 * и по верхнему краю таймер повисал бы у самой крупной строки макета.
 */
export const head = style({
  ...flexColumn(16),
  ...media({
    sm: {
      ...flexRow(24),
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
  }),
})

export const heading = style({
  ...flexColumn(8),
  // Фокус сюда ставит код после смены страницы (`focusKey`), это не элемент
  // управления — рамка вокруг заголовка выглядела бы как поломка.
  outline: 'none',
})

/** Таймер не сжимается: его ширина фиксирована, отдавать её сетке нечему. */
export const aside = style({
  flexShrink: 0,
})

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
