import { style } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'
import {
  fieldControl,
  fieldError,
  fieldHint,
  fieldInvalid,
  fieldLabel,
  flexColumn,
} from '../../styling/mixin'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

/** Обёртка нужна только чтобы положить стрелку поверх нативного `select`. */
export const shell = style({
  position: 'relative',
  display: 'flex',
})

export const control = style([
  fieldControl(),
  {
    appearance: 'none',
    cursor: 'pointer',
    paddingRight: vars.space.xl,
  },
])

export const invalid = style(fieldInvalid())

export const chevron = style({
  position: 'absolute',
  right: vars.space.sm,
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: rem(18),
  color: color.text('muted'),
  pointerEvents: 'none',
})

export const hint = style(fieldHint())

export const error = style(fieldError())
