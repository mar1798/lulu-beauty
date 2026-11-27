import { style } from '@vanilla-extract/css'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Mobile first: секции - панели друг под другом на всю ширину, поля в одну колонку.
 * Две картинки встают рядом только с `lg`, как баннеры акции.
 */
export const container = style({
  ...flexColumn(20),
  minWidth: 0,
})

export const switches = style(flexColumn(8))

export const images = style({
  ...flexColumn(24),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

/** Превью внутри формы не кликабельно: ссылка слайда не должна уводить со страницы с несохранёнными правками. */
export const preview = style({
  pointerEvents: 'none',
})

export const actions = style({
  ...flexColumn(8),
  ...media({
    sm: { ...flexRow(8), flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  }),
})
