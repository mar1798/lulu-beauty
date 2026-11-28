import { globalStyle, style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(16),
  ...media({
    md: {
      ...flexRow(24),
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
  }),
})

export const text = style({
  ...flexColumn(8),
  maxWidth: '52ch',
})

/**
 * Надзаголовок капителью с разрядкой — приём референса: он подписывает
 * секцию, не соревнуясь с самим заголовком по кеглю.
 *
 * Цвет — `brand.700`, а не семантический `text.brand` (это 600): на холсте
 * 600 даёт 4.34:1 при требуемых для мелкого текста 4.5:1, 700 — 6.16:1.
 */
export const eyebrow = style({
  font: font('12/16', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  color: color.brand('700'),
})

export const action = style({
  flexShrink: 0,
})

/**
 * Слот иконки у заголовка (сезонный декор). Нулевые ширина и высота в потоке,
 * сама картинка висит абсолютом: она не сдвигает перенос слов и не растягивает
 * строку, поэтому не даёт CLS, даже когда приходит после гидратации. Центр
 * картинки - на середине строки заголовка. Пустой слот скрыт.
 */
export const titleDecor = style({
  display: 'inline-flex',
  alignItems: 'center',
  width: 0,
  height: 0,
  verticalAlign: 'middle',
  /* Отступ от слова - трансформацией: поля и padding прибавили бы ширину в потоке. */
  transform: `translateX(${vars.space.sm})`,
  pointerEvents: 'none',
  selectors: {
    '&:empty': { display: 'none' },
  },
})

/* Картинка не должна сжиматься в нулевой ширине слота: ни flex-shrink, ни `max-width: 100%` из preflight. */
globalStyle(`${titleDecor} > *`, { flexShrink: 0, maxWidth: 'none' })
