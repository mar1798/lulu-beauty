import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow, lineClamp } from '../../styling/mixin'
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
  warning: { borderLeft: border(4, color.warning('500')) },
  danger: { borderLeft: border(4, color.danger('500')) },
})

export const body = style({
  ...flexColumn(2),
  minWidth: 0,
  /*
   * Название товара приезжает в тост целиком, а длинное встречается сплошным
   * куском («SUPER-HYDRA-SERUM-30ML»): без переноса внутри слова оно вылезает
   * за карточку, потому что ширина тоста фиксирована (`maxWidth` выше).
   */
  overflowWrap: 'anywhere',
})

/**
 * Две строки и многоточие — и у заголовка, и у пояснения.
 *
 * Тост висит поверх страницы и уезжает сам, поэтому читают его по диагонали:
 * товар с длинным названием («…убран») разворачивал карточку на пол-экрана и
 * закрывал то, к чему человек уже вернулся. Обрезанное название узнаётся по
 * началу — ровно за этим оно в тосте и стоит.
 */
export const title = style({
  ...lineClamp(2),
  font: font('15/22', 600),
  color: color.text('primary'),
})

export const description = style({
  ...lineClamp(2),
  font: font('14/20'),
  color: color.text('secondary'),
})

/**
 * Кнопки уведомления — одной группой у правого края: обратное действие
 * («Вернуть») и закрытие. Без группы `Вернуть` расталкивало бы текст, и
 * крестик у тостов с действием и без стоял бы на разной высоте.
 */
export const controls = style({
  ...flexRow(4),
  alignItems: 'center',
  marginLeft: 'auto',
  /* Текст обрезается, кнопки — нет: «Вернуть» иначе переносилось бы по слогам. */
  flexShrink: 0,
})

export const close = style({
  marginRight: rem(-8),
})
