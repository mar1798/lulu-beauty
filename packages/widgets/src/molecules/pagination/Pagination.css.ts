import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Одна строка всегда. Полный ряд номеров на телефоне (с 4-й страницы — семь
 * элементов плюс две стрелки) в 320-375px не помещался и уезжал на вторую строку;
 * там вместо номеров — «5 из 9» между стрелками (`compact`).
 */
export const container = style({
  ...flexRow(6),
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'nowrap',
})

/** Номера и многоточия — только с `sm`. */
export const wide = style({
  display: 'none',
  ...media({
    sm: { display: 'inline-flex' },
  }),
})

/** «5 из 9» — только до `sm`. */
export const compact = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `0 ${rem(8)}`,
  font: font('14/20', 500),
  color: color.text('secondary'),
  whiteSpace: 'nowrap',
  ...media({
    sm: { display: 'none' },
  }),
})

export const page = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(40),
    height: rem(40),
    padding: `0 ${rem(10)}`,
    font: font('14/20', 500),
    color: color.text('secondary'),
    backgroundColor: 'transparent',
    border: border(1, 'transparent'),
    borderRadius: vars.radius.pill,
    cursor: 'pointer',
    transition: transition('background-color', 'color', 'border-color'),
    selectors: {
      /*
        Текущую страницу ховер не перекрашивает: у неё заливка акцентом и белый
        текст, а подложка «sunken» сделала бы его нечитаемым. Остальные кнопки
        на наведении не только подсвечиваются, но и темнеют — иначе подпись
        остаётся вторичной и наведение читается как выключённое состояние.
      */
      '&:hover:not([disabled]):not([aria-current="page"])': {
        backgroundColor: color.surface('sunken'),
        color: color.text('primary'),
      },
      '&[disabled]': { opacity: 0.4, cursor: 'not-allowed' },
      '&[aria-current="page"]': {
        backgroundColor: color.brand('600'),
        borderColor: color.brand('600'),
        color: color.text('inverse'),
      },
    },
  },
  focusVisibleRing(),
])

export const arrow = style({
  fontSize: rem(18),
})

/** Многоточие — не кнопка: жать не на что. */
export const gap = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: rem(28),
  height: rem(40),
  font: font('14/20'),
  color: color.text('muted'),
})
