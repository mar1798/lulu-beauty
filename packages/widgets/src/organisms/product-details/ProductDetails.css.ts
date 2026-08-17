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

export const description = style({
  whiteSpace: 'pre-line',
})

/**
 * На мобилке оба действия делят строку поровну (`flex: 1 1 0`) — раньше они
 * переносились друг под друга и вдвоём занимали два экранных ряда. Подписи там
 * короткие («В корзину» / «В избранное»), а кегль и поля кнопок ужаты ниже, —
 * пара помещается и на 320px. Одинокое действие (товара нет в наличии — там
 * стоит текст, а не кнопка) занимает всю строку, как и раньше.
 *
 * С `md` — прежнее поведение: по содержимому и с переносом.
 */
export const action = style({
  ...flexRow(8),
  alignItems: 'stretch',
  marginTop: vars.space.xs,
  ...media({
    md: {
      gap: vars.space.md,
      alignItems: 'center',
      flexWrap: 'wrap',
    },
  }),
})

/* Действия — слоты из `apps/website`, поэтому раскладка задаётся отсюда. */
globalStyle(`${action} > *`, {
  flex: '1 1 0',
  minWidth: 0,
  ...media({
    md: { flex: '0 1 auto' },
  }),
})

/*
  Кнопки приходят слотами из `apps/website`, поэтому класс им не передать —
  ужимаем их отсюда. Размер `lg` задан ради десктопа, но в половину узкого
  экрана его поля не влезают: до `md` кегль и горизонтальные поля ужимаются,
  высота остаётся крупной, чтобы попадать пальцем.
*/
globalStyle(`${action} button, ${action} a`, {
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

