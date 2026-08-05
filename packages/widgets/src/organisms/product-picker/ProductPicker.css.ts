import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  padding: vars.space.md,
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.xl,
})

export const list = style({
  ...flexColumn(0),
})

/**
 * Строка результата — компактнее позиции заявки (миниатюра 48 против 64):
 * это подсказка поиска, а не содержимое заявки, и перевешивать сам состав
 * она не должна.
 */
export const row = style({
  ...flexRow(12),
  alignItems: 'center',
  paddingBlock: vars.space.sm,
  selectors: {
    '&:not(:last-child)': {
      borderBottom: border(1, color.border('subtle')),
    },
  },
})

export const thumb = style({
  position: 'relative',
  flexShrink: 0,
  width: '48px',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.md,
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
  ...flexColumn(4),
  flex: 1,
  minWidth: 0,
})

export const meta = style({
  ...flexRow(8),
  alignItems: 'center',
  flexWrap: 'wrap',
})

/** Скелетон повторяет геометрию строки: миниатюра и две подписи. */
export const skeletonThumb = style({
  flexShrink: 0,
  width: '48px',
  aspectRatio: '4 / 5',
})

export const skeletonLines = style({
  ...flexColumn(8),
  flex: 1,
  minWidth: 0,
})
