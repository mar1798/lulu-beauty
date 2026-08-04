import { style, styleVariants } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: rem(6),
  padding: `${rem(4)} ${rem(10)}`,
  font: font('13/18', 500),
  borderRadius: vars.radius.pill,
  whiteSpace: 'nowrap',
})

export const tone = styleVariants({
  neutral: { backgroundColor: color.neutral('100'), color: color.text('secondary') },
  brand: { backgroundColor: color.brand('100'), color: color.brand('700') },
  accent: { backgroundColor: color.accent('100'), color: color.accent('700') },
  success: { backgroundColor: color.success('100'), color: color.success('700') },
  warning: { backgroundColor: color.warning('100'), color: color.warning('700') },
  danger: { backgroundColor: color.danger('100'), color: color.danger('700') },
  info: { backgroundColor: color.info('100'), color: color.info('700') },
})

/** Точка-индикатор перед текстом: статус заявки читается и без цвета фона. */
export const dot = style({
  width: rem(6),
  height: rem(6),
  borderRadius: vars.radius.circle,
  backgroundColor: 'currentColor',
  flexShrink: 0,
})
