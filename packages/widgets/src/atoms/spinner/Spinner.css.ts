import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'

const spin = keyframes({
  to: { transform: 'rotate(360deg)' },
})

export const container = style({
  display: 'inline-block',
  flexShrink: 0,
  borderRadius: '50%',
  borderStyle: 'solid',
  borderColor: 'currentColor',
  borderTopColor: 'transparent',
  animation: `${spin} 0.7s linear infinite`,
  ...media({
    preferReducedMotion: {
      animationDuration: '2s',
    },
  }),
})

export const size = styleVariants({
  sm: { width: rem(16), height: rem(16), borderWidth: rem(2) },
  md: { width: rem(24), height: rem(24), borderWidth: rem(2) },
  lg: { width: rem(36), height: rem(36), borderWidth: rem(3) },
})
