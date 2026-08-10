import { style } from '@vanilla-extract/css'
import { color, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Карточка — две части: фотография сверху (некрупная, без своей тени) и
 * карточный блок снизу (тень + радиус), где живут тэги, название и цена.
 * На наведении приподнимается весь блок — сигнал даёт `container`, а не
 * отдельная ссылка внутри него.
 */
export const container = style({
  ...flexColumn(10),
  position: 'relative',
  height: '100%',
})

/**
 * Растянутая ссылка: `::after` перекрывает всю карточку (вплоть до фото),
 * поэтому клик работает где угодно, а не только по тексту заголовка.
 * У `footer` z-index выше — кнопка «в корзину» остаётся кликабельной поверх.
 */
export const link = style([
  {
    ...flexColumn(8),
    textDecoration: 'none',
    color: 'inherit',
    selectors: {
      // `container` (не `link`) — позиционированный предок, поэтому оверлей растягивается на всю карточку.
      '&::after': {
        content: '',
        position: 'absolute',
        inset: 0,
      },
    },
  },
  focusVisibleRing(),
])

/** Бокс под картинку: фиксированная пропорция держит сетку ровной, даже пока изображение грузится. */
export const media = style({
  position: 'relative',
  display: 'block',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.lg,
})

export const image = style({
  transition: transition('transform'),
  selectors: {
    [`${container}:hover &`]: { transform: 'scale(1.03)' },
  },
})

/** Заглушка, когда у товара ещё нет ни одной картинки (частый случай после импорта xlsx). */
export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: vars.space.xxl,
  color: color.text('subtle'),
})

export const stockBadge = style({
  position: 'absolute',
  left: vars.space.sm,
  top: vars.space.sm,
  backgroundColor: color.surface('base'),
  boxShadow: vars.shadow.sm,
})

/** Карточный блок под фотографией: тень + радиус отделяют его от холста. */
export const body = style({
  ...flexColumn(10),
  flexGrow: 1,
  padding: vars.space.md,
  borderRadius: vars.radius.xl,
  backgroundColor: color.surface('base'),
  boxShadow: vars.shadow.md,
  transition: transition('box-shadow'),
  selectors: {
    [`${container}:hover &`]: { boxShadow: vars.shadow.lg },
  },
})

export const tags = style({
  ...flexRow(6),
  flexWrap: 'wrap',
})

export const footer = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 'auto',
})

/**
 * Слот действия (кнопка «в корзину») поднят над оверлеем растянутой ссылки —
 * иначе клик по кнопке улетал бы как переход на страницу товара. Остальной
 * футер (цена) намеренно остаётся под оверлеем: клик по ней тоже ведёт на товар.
 */
export const action = style({
  position: 'relative',
  zIndex: 1,
})
