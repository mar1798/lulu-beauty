import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Mobile first: одна колонка, а подписи и рамка тянутся на всю ширину поля. */
export const container = style(flexColumn(8))

export const head = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
})

export const title = style({
  font: font('14/20', 600),
  color: color.text('primary'),
})

export const spec = style({
  margin: 0,
  font: font('13/20'),
  color: color.text('muted'),
})

/** Рамка превью: пропорцию подставляет компонент (`aspect-ratio` в `style`). */
export const frame = style({
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: color.surface('muted'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
})

export const image = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

export const placeholder = style({
  font: font('14/20', 600),
  color: color.text('subtle'),
  fontSize: rem(18),
})
