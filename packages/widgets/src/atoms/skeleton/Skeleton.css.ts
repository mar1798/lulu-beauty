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
  backgroundColor: color.neutral('200'),
  animation: `${pulse} 1.4s ease-in-out infinite`,
  ...media({
    preferReducedMotion: {
      animation: 'none',
    },
  }),
})

export const shape = styleVariants({
  text: { height: rem(14), borderRadius: vars.radius.xs },
  block: { borderRadius: vars.radius.md },
  circle: { borderRadius: vars.radius.circle },
})
