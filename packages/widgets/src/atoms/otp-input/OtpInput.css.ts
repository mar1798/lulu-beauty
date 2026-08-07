import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { fieldError, fieldLabel, flexColumn, flexRow, focusRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

export const cells = style({
  ...flexRow(6),
  alignItems: 'center',
  ...media({ sm: { columnGap: rem(8) } }),
})

/**
 * 6 ячеек по 48px с зазором 8px не умещаются на 390px внутри карточки формы
 * (около 294px доступной ширины) — мобильная база уже, с `sm` возвращается
 * к прежнему размеру.
 */
export const cell = style({
  width: rem(40),
  height: rem(48),
  textAlign: 'center',
  font: font('18/24', 600),
  color: color.text('primary'),
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
  transition: transition('border-color', 'box-shadow'),
  ...media({ sm: { width: rem(48), height: rem(56), font: font('22/28', 600) } }),
  selectors: {
    '&:focus-visible': {
      ...focusRing(),
      borderColor: color.border('focus'),
    },
    '&:disabled': {
      backgroundColor: color.surface('sunken'),
      cursor: 'not-allowed',
    },
  },
})

export const invalid = style({
  borderColor: color.danger('500'),
})

export const error = style(fieldError())
