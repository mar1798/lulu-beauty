import { style } from '@vanilla-extract/css'
import { border, color, font } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, panel } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(20),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

export const form = style({
  ...flexColumn(16),
  ...panel(),
})

/**
 * Цена, объём, категория и производитель — короткие поля, на широком экране им
 * незачем занимать строку каждому: встают парами по две колонки.
 */
export const row = style({
  ...flexColumn(16),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})

export const formActions = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingTop: vars.space.xs,
})

/**
 * Место панели фотографий (`AdminProductGallery`); имя не `media` — оно занято
 * хелпером медиазапросов.
 *
 * В одну колонку (до `lg`) стоит **над** формой: заводя товар, владелец
 * начинает со снимка, а под формой на полтора экрана вниз панель просто не
 * попадалась на глаза. Порядком, а не перестановкой в разметке: с `lg`
 * container — сетка, и там панель обязана остаться в правой колонке, то есть
 * второй по документу.
 */
export const mediaPanel = style({
  order: -1,
  ...media({
    lg: { order: 0 },
  }),
})

/**
 * Таблица объёмов. `fieldset` сбрасывается до обычного блока: браузерная рамка
 * с вырезом под легенду в этой форме выглядит чужеродно, а группировка нужна
 * ради скринридера, а не ради рамки.
 */
/** Тумблер «Показывать на главной» и подсказка под ним: у `Switch` своей нет. */
export const featured = style(flexColumn(6))

export const variants = style({
  ...flexColumn(12),
  margin: 0,
  padding: 0,
  border: 'none',
})

export const variantsLegend = style({
  padding: 0,
  font: font('16/24', 600),
  color: color.text('primary'),
})

/**
 * Строка варианта: на телефоне поля идут друг под другом, с `sm` встают в ряд.
 * Ширины заданы долями, а не `1fr` поровну: тон и цена длиннее объёма.
 *
 * Три колонки, а не четыре: тумблер с кнопкой «убрать» уезжает на полку под
 * полями (`variantControls`). Карточка формы — около 500px на любом экране, и
 * четвёртая колонка сжимала объём так, что подпись «Объём, мл» переносилась
 * на две строки и опускала поле ниже соседних, а подсказка наезжала на тон.
 *
 * Строки разделены чертой: в две полки каждая, без неё тумблер читался бы как
 * часть следующей строки, а не своей.
 */
export const variantRow = style({
  ...flexColumn(12),
  selectors: {
    '& + &': {
      paddingTop: vars.space.md,
      borderTop: border(1, color.border('subtle')),
    },
  },
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr) minmax(0, 3fr)',
      gap: `${vars.space.xs} ${vars.space.md}`,
      alignItems: 'start',
    },
  }),
})

/**
 * Тумблер «в наличии» и «убрать вариант» — одна строка на любой ширине, на
 * `sm` — полка во всю ширину под полями строки.
 */
export const variantControls = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  ...media({
    sm: {
      gridColumn: '1 / -1',
    },
  }),
})
