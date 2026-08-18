import { style, styleVariants } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Половина токена ритма с каждой стороны: расстояние между соседними
 * секциями складывается из двух паддингов ровно в токен, а фон и пятна
 * секции получают свой воздух. Гнать отступ целиком с обеих сторон нельзя —
 * между секциями вышло бы два токена подряд.
 *
 * `overflow: hidden` обязателен: без него уехавшее по параллаксу пятно
 * `DecorField` даёт горизонтальную прокрутку страницы.
 */
export const container = style({
  position: 'relative',
  overflow: 'hidden',
})

export const density = styleVariants({
  default: {
    paddingBlock: `calc(${vars.space.huge} / 2)`,
    ...media({
      md: { paddingBlock: `calc(${vars.space.giant} / 2)` },
    }),
  },
  /** Плотный ритм секции-оглавления: она не должна забирать пол-экрана. */
  compact: {
    paddingBlock: `calc(${vars.space.xxl} / 2)`,
    ...media({
      md: { paddingBlock: `calc(${vars.space.xxxl} / 2)` },
    }),
  },
})

/**
 * Несущая часть инварианта «товар виден целиком»: половина высоты самого
 * крупного пятна (~186px) плюс полная амплитуда параллакса (72px) плюс
 * воздух должны уложиться от центра пятна до края секции. На мобильном
 * пятна мельче (нижняя ступень `clamp()`), и высоты хватает без правила.
 *
 * Содержимое при этом центрируется по вертикали: `min-height` растит секцию
 * под пятно, а не под контент, и у короткой секции (компактный «ассортимент»)
 * весь запас высоты иначе сваливается под последний блок — полторы сотни
 * пикселей пустоты читаются не как воздух, а как оборванная вёрстка.
 */
export const withDecor = style({
  ...media({
    md: {
      minHeight: rem(560),
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    },
  }),
})

export const tone = styleVariants({
  plain: {},
  /** Мягкая марочная плашка — тот же приём, что был у старого героя. */
  soft: { backgroundColor: color.surface('soft') },
  ink: {
    backgroundColor: color.background('inverse'),
    color: color.text('inverse'),
  },
})

/** Контент поверх слоя пятен: у `DecorField` `position: absolute` и он первый. */
export const content = style({
  ...flexColumn(24),
  position: 'relative',
})
