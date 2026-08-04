import { style, styleVariants } from '@vanilla-extract/css'
import { rem } from '../../styling/lib'
import { container as containerMixin } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(containerMixin())

/** Узкие варианты — формы входа и текстовые страницы. */
export const width = styleVariants({
  narrow: { maxWidth: rem(480) },
  medium: { maxWidth: rem(768) },
  wide: {},
})

export const padded = style({
  paddingBlock: vars.space.xl,
})
