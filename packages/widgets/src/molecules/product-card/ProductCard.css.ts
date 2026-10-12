import { style } from '@vanilla-extract/css'
// `media` здесь занято экспортом стиля картинки, поэтому хелпер медиазапросов взят под псевдонимом.
import { color, media as mediaQuery, rem, transition } from '../../styling/lib'
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
 * изображение грузится. Ни подложки, ни рамки — фотография лежит прямо на
 * белой карточке.
 */
export const media = style({
  position: 'relative',
  display: 'block',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  borderRadius: vars.radius.xl,
})

export const image = style({
  transition: transition('transform'),
  ...mediaQuery({
    // Как подъём карточки: на тапе наведение залипает, и фото оставалось увеличенным.
    hoverAnimatable: {
      selectors: {
        [`${container}:hover &`]: { transform: 'scale(1.04)' },
      },
    },
  }),
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

/**
 * Цена и действие в одну строку, прижатые к низу карточки.
 *
 * Тесно здесь уже на 390px: «от 12 222 сом» и круглая кнопка вместе шире
 * футера. Первой уступает цена — «от» поднимается над суммой (см. `price`), и
 * кнопка остаётся в строке. Перенос самой кнопки на свою строку, к правому
 * краю, — запасной ход для 320px, где рядом с ней не помещается и голая сумма.
 */
export const footer = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  // Не `center`: при поднятом «от» по центру кнопки вставал весь двухстрочный блок, и сумма уезжала ниже неё (см. `price`).
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  marginTop: 'auto',
})

/**
 * Цена уступает место кнопке раньше, чем кнопка уходит на новую строку.
 *
 * Строки flex разбивает по базовой ширине элемента, а она по умолчанию —
 * ширина цены в одну строку: кнопка переносилась, даже когда «от» можно было
 * просто поднять над суммой. Базис 0 с `min-width: min-content` разбивает по
 * самой узкой форме цены — сумме без «от» — а `flexGrow` возвращает ей всё
 * свободное место, так что при достатке ширины «от» стоит в строке, как раньше.
 */
export const price = style({
  flex: '1 0 0',
  minWidth: 'min-content',
  /*
    Футер прижимает цену и кнопку к низу, а этот отступ поднимает строку суммы
    ровно на середину круга: (40 - 24) / 2 — высота `IconButton` md минус
    строка `Price` md. Так сумма стоит в линию с кнопкой одинаково, поднято
    над ней «от» или нет.
  */
  paddingBottom: rem(8),
  whiteSpace: 'normal',
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
  marginLeft: 'auto',
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
