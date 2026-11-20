import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { fieldError, flexColumn, flexRow, visuallyHidden } from '../../styling/mixin'
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

/**
 * Рамка превью: пропорцию подставляет компонент (`aspect-ratio` в `style`).
 * В пустой рамке подпись пропорции и кнопка стоят по центру друг под другом.
 */
export const frame = style({
  ...flexColumn(12),
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
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

export const frameInvalid = style({
  borderColor: color.danger('500'),
})

/** Поверх загруженного баннера кнопка уходит в угол, чтобы не закрывать картинку. */
export const pickOverImage = style({
  position: 'absolute',
  right: vars.space.sm,
  bottom: vars.space.sm,
})

export const input = style(visuallyHidden())

export const error = style(fieldError())
