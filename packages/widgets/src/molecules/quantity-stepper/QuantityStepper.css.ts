import { style } from '@vanilla-extract/css'
import { border, color, font, media, rem, transition } from '../../styling/lib'
import { flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(0),
  alignItems: 'center',
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.pill,
  boxShadow: vars.shadow.sm,
  overflow: 'hidden',
  width: 'fit-content',
})

export const button = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    /*
      До `sm` кнопки на четыре пикселя уже: степпер стоит в строке заявки
      рядом с крестиком «убрать», и на узком экране пара не помещалась —
      крестик переносился под степпер (см. `OrderItemRow.css`).
    */
    width: rem(32),
    height: rem(32),
    font: font('18/18', 500),
    color: color.text('secondary'),
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: transition('background-color', 'color'),
    selectors: {
      '&:hover:not([disabled])': {
        backgroundColor: color.surface('sunken'),
        color: color.text('primary'),
      },
      '&[disabled]': { opacity: 0.4, cursor: 'not-allowed' },
    },
    ...media({
      sm: { width: rem(36), height: rem(36) },
    }),
  },
  focusVisibleRing(),
])

export const value = style({
  minWidth: rem(32),
  textAlign: 'center',
  font: font('16/24', 600),
  fontVariantNumeric: 'tabular-nums',
  color: color.text('primary'),
  ...media({
    sm: { minWidth: rem(40) },
  }),
})
