import { style } from '@vanilla-extract/css'
import { color, font } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'
import {
  fieldControl,
  fieldError,
  fieldHint,
  fieldInvalid,
  fieldLabel,
  flexColumn,
  flexRow,
} from '../../styling/mixin'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

export const control = style([
  fieldControl(),
  {
    resize: 'vertical',
    minHeight: 'auto',
    /**
     * Единственный контрол, который не пилюля: у многострочного поля круглые
     * торцы съедали бы первую и последнюю строку. Радиус карточного семейства.
     */
    borderRadius: vars.radius.xl,
    padding: `${vars.space.sm} ${vars.space.md}`,
  },
])

export const invalid = style(fieldInvalid())

export const footer = style({
  ...flexRow(8),
  justifyContent: 'space-between',
  alignItems: 'baseline',
})

export const hint = style(fieldHint())

export const error = style(fieldError())

/** Счётчик символов: важен для `note`, у которого на бэке лимит 2000. */
export const counter = style({
  font: font('12/18'),
  color: color.text('muted'),
  marginLeft: 'auto',
  flexShrink: 0,
})
