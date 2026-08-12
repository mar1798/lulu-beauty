import { style } from '@vanilla-extract/css'
import { calc } from '@vanilla-extract/css-utils'
import { color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { wrapperPadding } from '../../styling/properties.css'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(24),
  paddingBlock: vars.space.lg,
  ...media({
    sm: { paddingBlock: vars.space.xl },
  }),
})

export const body = style({
  ...flexColumn(24),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: `${rem(220)} minmax(0, 1fr)`,
      gap: vars.space.xl,
      alignItems: 'start',
    },
  }),
})

/**
 * Левая колонка целиком: разделы плюс фильтры раздела. Прилипание живёт
 * здесь, а не на `nav`, — иначе фильтры уезжали бы вверх отдельно от него.
 *
 * На узком экране обёртки обеих колонок растворяются (`display: contents`), и
 * порядок четырёх блоков задаётся `order` на них самих: разделы → заголовок →
 * фильтры → содержимое. Без этого фильтры, лежащие в левой колонке, вставали
 * бы **над** заголовком страницы — на «Товарах» первым, что видел владелец,
 * был выбор категории, а не слово «Товары».
 *
 * `order` не сбрасывается на широком экране: там оба блока снова становятся
 * флексами со своими двумя детьми, и те же значения дают тот же порядок.
 */
export const side = style({
  display: 'contents',
  ...media({
    lg: {
      ...flexColumn(16),
      minWidth: 0,
      position: 'sticky',
      top: rem(96),
    },
  }),
})

/**
 * На узком экране разделы идут строкой с горизонтальной прокруткой: их шесть,
 * и колонка на телефоне съела бы экран целиком ещё до содержимого.
 *
 * Полоса вытянута под поля страницы отрицательным полем и возвращает их
 * внутренним отступом: так первый раздел стоит по сетке, а прокручиваемые
 * уходят под самый край экрана — обрыв ровно по краю читается как «дальше
 * есть ещё», а обрыв по внутренней границе читался как поломка.
 */
export const nav = style({
  ...flexRow(8),
  order: 1,
  overflowX: 'auto',
  overscrollBehaviorInline: 'contain',
  scrollSnapType: 'inline proximity',
  scrollbarWidth: 'none',
  marginInline: calc(wrapperPadding).negate().toString(),
  paddingInline: wrapperPadding,
  paddingBottom: vars.space.xxs,
  ...media({
    lg: {
      ...flexColumn(4),
      overflowX: 'visible',
      marginInline: 0,
      paddingInline: 0,
    },
  }),
})

export const navLink = style([
  {
    ...flexRow(8),
    alignItems: 'center',
    flexShrink: 0,
    scrollSnapAlign: 'start',
    font: font('15/22', 500),
    color: color.text('secondary'),
    textDecoration: 'none',
    padding: `${rem(8)} ${vars.space.sm}`,
    borderRadius: vars.radius.pill,
    whiteSpace: 'nowrap',
    transition: transition('color', 'background-color'),
    selectors: {
      '&:hover': { color: color.text('primary'), backgroundColor: color.surface('muted') },
      /* Марочный 700 — на розовой подложке 600 не добирает до WCAG AA (как в AccountTemplate). */
      '&[aria-current="page"]': {
        color: color.brand('700'),
        backgroundColor: color.surface('soft'),
      },
    },
  },
  focusVisibleRing(),
])

export const navIcon = style({
  display: 'inline-flex',
  fontSize: rem(18),
  color: 'currentColor',
})

/**
 * Фильтры раздела под навигацией: на широком экране отделены от разделов
 * линией — пункты фильтра не ссылки, и слипаться с ними им незачем. На
 * узком это блок между заголовком страницы и её содержимым.
 */
export const aside = style({
  ...flexColumn(12),
  order: 3,
  minWidth: 0,
  ...media({
    lg: {
      paddingTop: vars.space.md,
      borderTop: `${rem(1)} solid ${color.border('subtle')}`,
    },
  }),
})

export const content = style({
  display: 'contents',
  ...media({
    lg: {
      ...flexColumn(20),
      minWidth: 0,
    },
  }),
})

export const head = style({
  ...flexColumn(12),
  order: 2,
  minWidth: 0,
  ...media({
    sm: {
      ...flexRow(16),
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    },
  }),
})

export const headText = style(flexColumn(4))

export const actions = style({
  ...flexRow(8),
  flexWrap: 'wrap',
})

/** Содержимое раздела. Отдельный блок от `head` — им нужен разный `order`. */
export const main = style({
  ...flexColumn(20),
  order: 4,
  minWidth: 0,
})
