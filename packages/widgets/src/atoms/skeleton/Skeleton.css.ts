import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { vars } from '../../styling/themes/contract.css'

const pulse = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.55 },
})

export const container = style({
  display: 'block',
  animation: `${pulse} 1.4s ease-in-out infinite`,
  ...media({
    preferReducedMotion: {
      animation: 'none',
    },
  }),
})

/**
 * Полоска обязана отличаться от подложки, на которой лежит, а оба тона
 * рассчитаны на белую: `neutral-200` (#ebebeb) даёт на ней 1.19:1 — отраслевая
 * норма скелетона, его видно. На утопленной поверхности (#f2f4f5, она же фон
 * страницы) тот же цвет даёт 1.08:1, то есть не виден вовсе, и пульс меняет
 * прозрачность у того, чего на экране нет, — поэтому скелетон там кладут на
 * белую карточку (см. `ProductPicker.css.ts`), а не темнят полоску.
 */
export const tone = styleVariants({
  neutral: { backgroundColor: color.neutral('200') },
  brand: { backgroundColor: color.brand('100') },
})

export const shape = styleVariants({
  text: { height: rem(14), borderRadius: vars.radius.xs },
  block: { borderRadius: vars.radius.xl },
  circle: { borderRadius: vars.radius.circle },
})
