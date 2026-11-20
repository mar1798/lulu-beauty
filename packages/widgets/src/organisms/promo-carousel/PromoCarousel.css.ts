import { style } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Рамка карусели; позиционирование - для плашки управления поверх баннера. */
export const container = style({
  position: 'relative',
  overflow: 'hidden',
  borderRadius: vars.radius.xxl,
  backgroundColor: color.surface('sunken'),
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
 * Плашка управления поверх баннера: полупрозрачная подложка, потому что баннер
 * под ней может быть любого цвета, а белые точки на светлом не читались бы.
 */
export const controls = style({
  position: 'absolute',
  insetInline: 0,
  bottom: vars.space.sm,
  marginInline: 'auto',
  width: 'fit-content',
  maxWidth: 'calc(100% - 24px)',
  display: 'flex',
  alignItems: 'center',
  paddingInline: vars.space.xxs,
  backgroundColor: 'rgba(0, 0, 0, 0.38)',
  borderRadius: vars.radius.pill,
  backdropFilter: 'blur(6px)',
})

/** Кнопка плашки - зона нажатия 44x44, как требует палец; видимый знак внутри мельче. */
export const control = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(44),
    minHeight: rem(44),
    padding: 0,
    fontSize: rem(18),
    color: '#ffffff',
    background: 'none',
    border: 0,
    cursor: 'pointer',
  },
  focusVisibleRing(),
])

export const dot = style({
  display: 'block',
  width: rem(8),
  height: rem(8),
  borderRadius: vars.radius.circle,
  backgroundColor: '#ffffff',
})
