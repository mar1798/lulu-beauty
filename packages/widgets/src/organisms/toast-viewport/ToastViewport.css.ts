import { style } from '@vanilla-extract/css'
import { rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(8),
  position: 'fixed',
  insetInline: vars.space.md,
  bottom: vars.space.md,
  zIndex: vars.zIndex.toast,
  alignItems: 'stretch',
  /* Колонка не должна ловить клики по странице — их принимает только сам тост. */
  pointerEvents: 'none',
  ...media({
    md: {
      insetInlineStart: 'auto',
      insetInlineEnd: vars.space.lg,
      bottom: vars.space.lg,
      width: rem(380),
    },
  }),
})
