import { globalStyle, style } from '@vanilla-extract/css'
import { font } from '../../styling/lib/font'
import { rem } from '../../styling/lib/rem'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * От `md` галерея и описание встают в два столбца. Раньше они делили ширину
 * поровну — картинка выходила огромной; галерея сужена вдвое (с 1fr до 3fr
 * у соседней колонки — то есть с 50% примерно до 25% ширины), а планшет
 * специально не отделён от десктопа: с `md` до бесконечности — одна и та
 * же пропорция.
 */
export const container = style({
  ...flexColumn(32),
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3fr)',
      gap: vars.space.xxl,
      alignItems: 'start',
    },
  }),
})

export const info = style(flexColumn(16))

export const tags = style({
  ...flexRow(6),
  flexWrap: 'wrap',
})

export const priceRow = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

/**
 * Переключатель объёма стоит между ценой и описанием: выбор меняет цену прямо
 * над собой, и связь между ними должна быть видна без прокрутки. Отступ сверху
 * чуть больше колоночного — ряд кнопок иначе слипается со строкой цены.
 */
export const variants = style({
  marginTop: vars.space.xs,
})

export const description = style({
  whiteSpace: 'pre-line',
})

/**
 * Строка действий: подписанная «в корзину» во всю оставшуюся ширину и круглое
 * сердце рядом.
 *
 * Сердце — иконкой, а не второй подписанной кнопкой: подписи делили строку
 * пополам, и на узком экране ужимались обе, хотя действия не равны. Главное
 * обязано читаться словами, второе опознаётся сердцем — тем же, что в углу
 * карточки каталога.
 *
 * Переноса нет: сердце фиксированной ширины, а кнопка занимает остаток, так
 * что вдвоём они помещаются в строку и на 320px.
 */
export const action = style({
  ...flexRow(8),
  alignItems: 'center',
  marginTop: vars.space.xs,
  ...media({
    md: { gap: vars.space.md },
  }),
})

/* Действия — слоты из `apps/website`, поэтому раскладка задаётся отсюда. */
export const actionPrimary = style({
  flex: '1 1 auto',
  minWidth: 0,
  ...media({
    /* С `md` — по содержимому: во всю ширину колонки кнопка выглядит плакатом. */
    md: { flex: '0 1 auto' },
  }),
})

export const actionSecondary = style({
  flex: '0 0 auto',
  display: 'flex',
})

/*
  Кнопка приходит слотом из `apps/website`, поэтому класс ей не передать —
  ужимаем её отсюда. Размер `lg` задан ради десктопа, но в узкой строке рядом с
  сердцем его поля не влезают: до `md` кегль и горизонтальные поля ужимаются,
  высота остаётся крупной, чтобы попадать пальцем.
*/
globalStyle(`${actionPrimary} button, ${actionPrimary} a`, {
  paddingLeft: vars.space.sm,
  paddingRight: vars.space.sm,
  font: font('15/22', 600),
  ...media({
    md: {
      paddingLeft: vars.space.xl,
      paddingRight: vars.space.xl,
      font: font('17/26', 600),
    },
  }),
})

/*
  Сердце ровняется по высоте с соседней кнопкой: `IconButton` задаёт себе
  квадрат 48px, а `Button size="lg"` — 52px, и круг стоял бы ниже строки.
  Ширина правится вместе с высотой, иначе из круга получится овал.
*/
globalStyle(`${actionSecondary} button, ${actionSecondary} a`, {
  width: rem(52),
  height: rem(52),
})

/**
 * Строка под кнопками: почему «в корзину» погашена. Прижата к ним вплотную —
 * `action` уже отбил себе отступ сверху, и колоночный зазор между кнопкой и
 * её же объяснением увёл бы объяснение к следующему блоку.
 */
export const note = style({
  marginTop: `calc(-1 * ${vars.space.sm})`,
})

/**
 * Каркас на время загрузки повторяет пропорции `ProductGallery` (кадр `4 / 5`,
 * миниатюры по 72px) — иначе при подстановке товара страница подпрыгнула бы.
 */
export const skeletonGallery = style(flexColumn(12))

export const skeletonMedia = style({
  aspectRatio: '4 / 5',
  borderRadius: vars.radius.xxl,
  // Тот же потолок высоты, что и у настоящего кадра (см. `ProductGallery.css`).
  width: '100%',
  maxWidth: 'calc(40svh * 4 / 5)',
  alignSelf: 'center',
  ...media({
    md: { maxWidth: 'none', alignSelf: 'stretch' },
  }),
})

export const skeletonThumbs = style({
  ...flexRow(8),
  justifyContent: 'center',
  ...media({
    md: { justifyContent: 'flex-start' },
  }),
})

export const skeletonThumb = style({
  width: rem(72),
  aspectRatio: '1 / 1',
  borderRadius: vars.radius.lg,
})
