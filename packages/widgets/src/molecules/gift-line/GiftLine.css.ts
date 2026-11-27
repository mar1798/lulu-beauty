import { style } from '@vanilla-extract/css'
import { border, color } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Телефон: миниатюра, описание и «Бесплатно» в одну строку, описание сжимается
 * первым. Раскладка не меняется на широком экране - строка и так короткая.
 */
export const container = style({
  display: 'grid',
  gridTemplateColumns: '56px minmax(0, 1fr) auto',
  columnGap: vars.space.md,
  alignItems: 'center',
  paddingBlock: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
})

export const thumb = style({
  position: 'relative',
  width: '56px',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  borderRadius: vars.radius.lg,
  backgroundColor: color.brand('50'),
})

export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '28px',
  color: color.brand('600'),
})

export const body = style({
  ...flexColumn(4),
  alignItems: 'flex-start',
  minWidth: 0,
})

export const free = style({
  whiteSpace: 'nowrap',
  ...media({
    md: { minWidth: '120px', textAlign: 'right' },
  }),
})
