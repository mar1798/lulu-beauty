import { style } from '@vanilla-extract/css'
import { color, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  height: '100%',
})

export const link = style([
  {
    ...flexColumn(10),
    textDecoration: 'none',
    color: 'inherit',
  },
  focusVisibleRing(),
])

/**
 * Бокс под картинку: фиксированная пропорция держит сетку ровной, даже пока
 * изображение грузится, — иначе карточки прыгают по высоте.
 */
/**
 * Товар «плавает» на холсте: рамки нет, отделяет мягкая двухслойная тень,
 * на наведении карточка приподнимается. Радиус — внутренний, карточный (20px).
 */
export const media = style({
  position: 'relative',
  display: 'block',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xl,
  boxShadow: vars.shadow.md,
  transition: transition('box-shadow'),
  selectors: {
    [`${link}:hover &`]: { boxShadow: vars.shadow.lg },
  },
})

export const image = style({
  transition: transition('transform'),
  selectors: {
    [`${link}:hover &`]: { transform: 'scale(1.03)' },
  },
})

/** Заглушка, когда у товара ещё нет ни одной картинки (частый случай после импорта xlsx). */
export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: vars.space.xxl,
  color: color.text('subtle'),
})

export const stockBadge = style({
  position: 'absolute',
  left: vars.space.sm,
  top: vars.space.sm,
  backgroundColor: color.surface('base'),
  boxShadow: vars.shadow.sm,
})

export const footer = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 'auto',
})
