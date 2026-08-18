import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexRow, focusVisibleRing, gridAutoFit } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Компактная сетка: две колонки на 375px, пять-шесть на десктопе. Плитка
 * первой реализации (220×120, display-кегль) забирала пол-экрана и по весу
 * спорила с подборкой товаров — а это оглавление, не витрина.
 */
export const container = style({
  ...gridAutoFit(150, 10),
  listStyle: 'none',
})

/**
 * Чип-ссылка: текстовый кегль, волосяная граница, скругление `pill`.
 * 56px по высоте — всё ещё комфортные 44+px под палец.
 */
export const tile = style([
  {
    ...flexRow(12),
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: rem(56),
    paddingInline: vars.space.md,
    paddingBlock: vars.space.xs,
    border: border(1, color.border('subtle')),
    borderRadius: vars.radius.pill,
    textDecoration: 'none',
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    transition: transition('background-color', 'border-color'),
    ...media({
      /*
        Наведение — только на устройствах с настоящим hover: на таче у чипа
        уже есть анимация входа в вьюпорт, эмулировать наведение не из чего.
        Подъёма `translateY` нет: на чипе такой высоты он читается как
        дрожание.
      */
      hoverAnimatable: {
        selectors: {
          '&:hover': {
            backgroundColor: color.brand('50'),
            borderColor: color.brand('200'),
          },
        },
      },
    }),
  },
  focusVisibleRing(),
])

export const name = style({
  font: font('15/20', 500),
  overflowWrap: 'anywhere',
})

export const chevron = style({
  flexShrink: 0,
  fontSize: rem(16),
  color: color.text('brand'),
  transition: transition('transform'),
  ...media({
    hoverAnimatable: {
      selectors: {
        [`${tile}:hover &`]: { transform: 'translateX(4px)' },
      },
    },
  }),
})
