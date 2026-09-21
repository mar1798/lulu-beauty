import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { FIELD_HEIGHT, flexColumn, flexRow, panel } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Высота подписи поля (`fieldLabel`, строка 20px) вместе с зазором до самого
 * поля (`Input` держит колонку с `rowGap: 6`). На эту полку опускается всё,
 * что в строке стоит без подписи, но обязано выровняться с полями.
 */
const LABEL_BAND = 26

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
 * Панель фотографий; имя не `media` — оно занято хелпером медиазапросов.
 *
 * В одну колонку (до `lg`) стоит **над** формой: заводя товар, владелец
 * начинает со снимка, а под формой на полтора экрана вниз панель просто не
 * попадалась на глаза. Порядком, а не перестановкой в разметке: с `lg`
 * container — сетка, и там панель обязана остаться в правой колонке, то есть
 * второй по документу.
 */
export const mediaPanel = style({
  ...flexColumn(16),
  ...panel(),
  order: -1,
  ...media({
    lg: { order: 0 },
  }),
})

export const gallery = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${rem(96)}, 1fr))`,
  gap: vars.space.sm,
  listStyle: 'none',
  ...media({
    sm: { gridTemplateColumns: `repeat(auto-fill, minmax(${rem(120)}, 1fr))` },
  }),
})

export const thumb = style({
  position: 'relative',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
})

export const thumbImage = style({
  // Фотография товара нигде не обрезается — см. `AppImage`/`components/Image.tsx`.
  objectFit: 'contain',
})

export const thumbDelete = style({
  position: 'absolute',
  insetInlineEnd: vars.space.xxs,
  insetBlockEnd: vars.space.xxs,
  backgroundColor: color.surface('base'),
})

/**
 * Таблица объёмов. `fieldset` сбрасывается до обычного блока: браузерная рамка
 * с вырезом под легенду в этой форме выглядит чужеродно, а группировка нужна
 * ради скринридера, а не ради рамки.
 */
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
 * Строка объёма: на телефоне поля идут друг под другом, с `sm` встают в ряд.
 * Ширины заданы долями, а не `1fr` поровну: цена длиннее объёма, а тумблеру с
 * кнопкой нужно ровно столько, сколько они занимают, — они делят третью
 * ячейку (`variantControls`).
 */
export const variantRow = style({
  ...flexColumn(12),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 4fr) auto',
      gap: vars.space.md,
      alignItems: 'start',
    },
  }),
})

/**
 * Тумблер «в наличии» и «убрать объём» — одна строка на любой ширине.
 *
 * На десктопе они обязаны встать по центру полей, а не по центру ячейки:
 * ячейка тянется на подпись и подсказку, и `alignItems: center` посадил бы их
 * то выше, то ниже — в зависимости от того, есть ли под полем подсказка или
 * ошибка. Поэтому ячейка сама получает высоту поля и полку сверху ровно под
 * подпись (`14/20` плюс зазор `Input`), а содержимое центрируется уже в ней.
 */
export const variantControls = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  ...media({
    sm: {
      justifyContent: 'flex-start',
      minHeight: rem(FIELD_HEIGHT),
      marginTop: rem(LABEL_BAND),
    },
  }),
})
