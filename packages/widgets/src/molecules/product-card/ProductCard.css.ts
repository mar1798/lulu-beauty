import { style } from '@vanilla-extract/css'
// `media` здесь занято экспортом стиля картинки, поэтому хелпер медиазапросов взят под псевдонимом.
import { color, media as mediaQuery, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing, tagRow, tagSeparator } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Карточка — единый белый блок с крупным скруглением: фотография лежит
 * *внутри* него на утопленной подложке, а не отдельным боксом сверху.
 * Внутренний радиус картинки на ступень меньше внешнего — иначе углы фото
 * визуально «протыкают» углы карточки.
 *
 * На наведении приподнимается вся карточка: сигнал даёт `container`, а не
 * отдельная ссылка внутри него.
 */
export const container = style({
  ...flexColumn(),
  position: 'relative',
  height: '100%',
  padding: vars.space.xs,
  borderRadius: vars.radius.xxl,
  backgroundColor: color.surface('base'),
  boxShadow: vars.shadow.md,
  transition: transition('box-shadow', 'transform'),
  selectors: {
    '&:hover': { boxShadow: vars.shadow.lg },
    /*
      Подсказка над кнопкой в футере выходит за границы карточки, а соседняя
      карточка стоит в потоке позже и без этого закрывала бы её собой: своего
      `z-index` у пузыря достаточно только внутри карточки. Подъём — на
      наведении и на фокусе внутри: с клавиатуры подсказка открывается так же.
    */
    '&:hover, &:focus-within': { zIndex: 1 },
  },
  ...mediaQuery({
    // Подъём — только там, где есть настоящее наведение: на тапе он залипает.
    hoverAnimatable: {
      selectors: {
        '&:hover': { transform: 'translateY(-2px)' },
      },
    },
  }),
})

/**
 * Растянутая ссылка: `::after` перекрывает всю карточку (вплоть до фото),
 * поэтому клик работает где угодно, а не только по тексту заголовка.
 * У `action` z-index выше — кнопка «в корзину» остаётся кликабельной поверх.
 */
export const link = style([
  {
    ...flexColumn(2),
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

/**
 * Бокс под картинку: фиксированная пропорция держит сетку ровной, даже пока
 * изображение грузится. Подложка — утопленная поверхность: у товарной съёмки
 * фон почти белый, и на белой карточке она без неё расплывалась бы.
 */
export const media = style({
  position: 'relative',
  display: 'block',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.xl,
})

export const image = style({
  transition: transition('transform'),
  selectors: {
    [`${container}:hover &`]: { transform: 'scale(1.04)' },
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
  left: vars.space.xs,
  top: vars.space.xs,
  backgroundColor: color.surface('base'),
  boxShadow: vars.shadow.sm,
})

/**
 * Текстовая часть: по горизонтали отступ добирается до 16px от края карточки
 * (8 у контейнера + 8 здесь) — картинка при этом остаётся прижатой к padding
 * контейнера, как в референсе.
 */
export const body = style({
  ...flexColumn(12),
  flexGrow: 1,
  padding: `${vars.space.sm} ${vars.space.xs} ${vars.space.xxs}`,
})

/** Метки под названием: марка, категория, объём — см. миксины `tagRow`/`tagSeparator`. */
export const tags = style(tagRow())

export const tag = style(tagSeparator())

/** Цена и действие в одну строку, прижатые к низу карточки. */
export const footer = style({
  ...flexRow(8),
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
  display: 'flex',
})

/**
 * Слот «в избранное» — в правом верхнем углу фотографии. Отсчёт от края
 * карточки, а не от фото: сам слот лежит вне `media` (иначе подсказку над
 * кнопкой обрезал бы его `overflow: hidden`), поэтому отступ складывается из
 * padding контейнера (8) и тех же 8 внутри фото — ровно как у `stockBadge` в
 * противоположном углу.
 */
export const mediaAction = style({
  position: 'absolute',
  top: vars.space.md,
  right: vars.space.md,
  // Над растянутым `::after` ссылки — иначе клик по сердцу уходил бы на страницу товара.
  zIndex: 1,
  display: 'flex',
})
