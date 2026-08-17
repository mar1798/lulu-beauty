import type { CSSProperties, StyleRule } from '@vanilla-extract/css'
import { color } from '../lib'
import { flexRow } from './flex'

const TAG_GAP = 6,
  DOT_SIZE = 3

/**
 * Строка меток товара: марка, категория, объём.
 *
 * С переносом — длинная метка не должна вытеснять соседние за край карточки.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/explicit-function-return-type
export function tagRow(gap: number = TAG_GAP) {
  return {
    ...flexRow(gap),
    flexWrap: 'wrap',
  } satisfies CSSProperties
}

/**
 * Разделитель между метками — точка. Без неё «Round lab Cleanser 1000 мл»
 * читается как одна фраза: метки одного размера и тона, и глазу не за что
 * зацепиться на границе.
 *
 * Точка — это `::after` самой метки, а не отдельный элемент во flex-строке:
 * при переносе она остаётся в конце предыдущей строки, а не повисает в начале
 * следующей.
 *
 * Рисуется кружком, а не глифом `·`: у глифа размер задаёт шрифт, кегль его
 * только масштабирует вместе с положением в строке — точка уезжала вверх,
 * оставаясь такой же мелкой. У кружка ширина и высота свои, а
 * `vertical-align: middle` держит его по центру строки меток.
 */
export function tagSeparator(gap: number = TAG_GAP): StyleRule {
  return {
    selectors: {
      '&:not(:last-child)::after': {
        content: '',
        display: 'inline-block',
        width: DOT_SIZE,
        height: DOT_SIZE,
        marginLeft: gap,
        borderRadius: '50%',
        verticalAlign: 'middle',
        backgroundColor: color.text('muted'),
      },
    },
  }
}
