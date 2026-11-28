import { style } from '@vanilla-extract/css'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  paddingBlock: vars.space.xxl,
})

/** `relative` - точка отсчёта для слоя `decor`. */
export const head = style({
  ...flexColumn(6),
  position: 'relative',
})

export const titleRow = style({
  ...flexRow(12),
  alignItems: 'center',
})

/*
  Высота ноль, а `align-items: center` у ряда центрирует это нулевое поле по строке
  заголовка: картинка вылезает за него поровну вверх и вниз и строку не растягивает.
  Пустой слот (декор вне сезона отдал `null`) скрыт целиком, чтобы не держать зазор.
*/
export const titleDecor = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  height: 0,
  pointerEvents: 'none',
  selectors: {
    '&:empty': { display: 'none' },
  },
})

/**
 * Слот сезонного декора: абсолютный слой на весь блок заголовка, без кликов. Места не
 * занимает, поэтому позднее появление (после гидрации) страницу не двигает; рисунок внутри
 * ставит тот, кто его передал. Пустой (вне сезона декор отдаёт `null`) скрыт.
 */
export const decor = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  selectors: {
    '&:empty': { display: 'none' },
  },
})
