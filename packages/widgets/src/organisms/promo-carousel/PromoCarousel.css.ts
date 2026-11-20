import { style } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Рамка карусели; позиционирование - для точек поверх баннера.
 *
 * Тень и тонкая линия по краю отделяют любой слайд от страницы: баннер на светлом
 * холсте иначе сливается с фоном каталога. Линия - внутренняя тень на `::after`
 * поверх картинок (у самой рамки она ушла бы под них) и полупрозрачная, чтобы
 * одинаково ложиться и на светлый, и на насыщенный баннер.
 */
export const container = style({
  position: 'relative',
  overflow: 'hidden',
  borderRadius: vars.radius.xxl,
  backgroundColor: color.surface('sunken'),
  boxShadow: vars.shadow.sm,
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
      pointerEvents: 'none',
    },
  },
})

/**
 * Ряд слайдов, который листает браузер. `scrollbar-width: none` прячет полосу, а
 * не прокрутку: она остаётся и пальцу, и колесу, и клавишам.
 * `overscroll-behavior-x: contain` не даёт жесту у края каталога превратиться
 * в «назад» браузера.
 */
export const scroller = style({
  display: 'flex',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollSnapType: 'x mandatory',
  overscrollBehaviorX: 'contain',
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': { display: 'none' },
  },
})

/**
 * Слайд - ровно ширина карусели на любом экране, никаких «полутора слайдов».
 * Пропорции - `BANNER_SPECS` (мобильный 1080x720, десктопный 1920x640): общие для
 * всех слайдов, чтобы высота не менялась ни при загрузке, ни при листании.
 */
export const slide = style({
  flex: '0 0 100%',
  minWidth: 0,
  aspectRatio: '3 / 2',
  scrollSnapAlign: 'start',
  scrollSnapStop: 'always',
  ...media({
    md: { aspectRatio: '3 / 1' },
  }),
})

export const link = style([
  {
    display: 'block',
    width: '100%',
    height: '100%',
    color: 'inherit',
    textDecoration: 'none',
  },
  focusVisibleRing(),
])

export const image = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

/**
 * Точки поверх баннера на тонкой полупрозрачной подложке: баннер под ними может
 * быть любого цвета, а белые точки на светлом без неё не читались бы. Подложка
 * нарочно лёгкая - индикатор не должен спорить с баннером.
 */
export const controls = style({
  position: 'absolute',
  zIndex: 1,
  insetInline: 0,
  bottom: vars.space.sm,
  marginInline: 'auto',
  width: 'fit-content',
  maxWidth: 'calc(100% - 24px)',
  display: 'flex',
  alignItems: 'center',
  paddingInline: rem(4),
  backgroundColor: 'rgba(0, 0, 0, 0.18)',
  borderRadius: vars.radius.pill,
  backdropFilter: 'blur(4px)',
})

/**
 * Кнопка-точка: зона нажатия 24x24 (минимум WCAG 2.5.8) - тоньше прежних 44, чтобы
 * плашка не была толстой. Точки дублируют свайп, поэтому меньшая зона допустима.
 */
export const control = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(20),
    minHeight: rem(24),
    padding: 0,
    color: '#ffffff',
    background: 'none',
    border: 0,
    cursor: 'pointer',
  },
  focusVisibleRing(),
])

export const dot = style({
  display: 'block',
  width: rem(6),
  height: rem(6),
  borderRadius: vars.radius.circle,
  backgroundColor: '#ffffff',
})
