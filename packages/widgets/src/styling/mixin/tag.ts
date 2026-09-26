import type { CSSProperties, StyleRule } from '@vanilla-extract/css'
import { color, rem } from '../lib'
import { flexRow } from './flex'

const TAG_GAP = 6,
  DOT_SIZE = 3

/**
 * Строка меток товара: марка, категория, объём.
 *
 * С переносом — длинная метка не должна вытеснять соседние за край карточки.
 * `overflow: hidden` — часть разделителя (см. `tagSeparator`): точка метки, открывающей
 * строку, выходит за левый край и обрезается.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/explicit-function-return-type
export function tagRow(gap: number = TAG_GAP) {
  return {
    ...flexRow(gap),
    flexWrap: 'wrap',
    overflow: 'hidden',
  } satisfies CSSProperties
}

/**
 * Разделитель между метками — точка. Без неё «Round lab Cleanser 1000 мл»
 * читается как одна фраза: метки одного размера и тона, и глазу не за что
 * зацепиться на границе.
 *
 * Точка — `::before` метки, стоящий посередине зазора слева от неё. У метки, которая
 * начинает строку (первой или перенесённой), точка оказывается левее края строки, и
 * `overflow: hidden` у `tagRow` её срезает. Прежняя `::after` в конце метки при
 * переносе оставалась висеть одна в конце строки.
 *
 * Рисуется кружком, а не глифом `·`: у глифа размер задаёт шрифт, кегль его
 * только масштабирует вместе с положением в строке — точка уезжала вверх,
 * оставаясь такой же мелкой.
 */
export function tagSeparator(gap: number = TAG_GAP): StyleRule {
  return {
    position: 'relative',
    selectors: {
      '&::before': {
        content: '',
        position: 'absolute',
        top: '50%',
        // Середина зазора: `flexRow` задаёт его в rem, точка — в пикселях.
        left: `calc((${rem(gap)} + ${DOT_SIZE}px) / -2)`,
        width: DOT_SIZE,
        height: DOT_SIZE,
        marginTop: -DOT_SIZE / 2,
        borderRadius: '50%',
        backgroundColor: color.text('muted'),
      },
    },
  }
}
