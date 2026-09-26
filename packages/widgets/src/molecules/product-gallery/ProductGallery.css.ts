import { style } from '@vanilla-extract/css'
import { border, color, font, media, rem, transition } from '../../styling/lib'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn(12))

/**
 * Главный кадр — «карточка, которой и является картинка»: 28px и мягкая тень.
 *
 * На мобилке кадр 4:5 во всю ширину съедал первый экран целиком — цена и
 * кнопки уходили за сгиб. Ширина ограничена так, чтобы высота не превышала
 * ~40svh (`40svh * 4 / 5`), а сам кадр центрируется; с `md` — как было, во всю
 * колонку.
 */
export const main = style({
  position: 'relative',
  width: '100%',
  maxWidth: 'calc(40svh * 4 / 5)',
  alignSelf: 'center',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
  ...media({
    md: {
      maxWidth: 'none',
      alignSelf: 'stretch',
    },
  }),
})

/**
 * Весь кадр — кнопка «открыть во весь экран». `pan-y` отдаёт браузеру только
 * вертикальную прокрутку страницы, а горизонтальный жест остаётся свайпу.
 */
export const mainButton = style([
  {
    position: 'absolute',
    inset: 0,
    display: 'block',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'zoom-in',
    touchAction: 'pan-y',
  },
  focusVisibleRing(),
])

export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: vars.space.xxxl,
  color: color.text('subtle'),
})

/* Миниатюры идут под центрированным кадром, поэтому центрируются вместе с ним. */
export const thumbs = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  justifyContent: 'center',
  ...media({
    md: { justifyContent: 'flex-start' },
  }),
})

export const thumb = style([
  {
    position: 'relative',
    width: rem(72),
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    padding: 0,
    border: border(2, 'transparent'),
    borderRadius: vars.radius.lg,
    cursor: 'pointer',
    transition: transition('border-color'),
    selectors: {
      '&:hover': { borderColor: color.border('default') },
      '&[aria-current="true"]': { borderColor: color.brand('600') },
    },
  },
  focusVisibleRing(),
])

/** Полноэкранный просмотр — поверх всего, на тёмной подложке, чтобы фото читалось. */
export const viewer = style({
  position: 'fixed',
  inset: 0,
  zIndex: vars.zIndex.modal,
  backgroundColor: color.surface('inverse', 0.92),
  outline: 'none',
})

/**
 * Кадр с полями под кнопки. `pan-y pinch-zoom` — вертикаль и щипок остаются
 * браузеру (увеличить надпись на упаковке), горизонталь — свайпу.
 */
export const viewerFrame = style({
  position: 'absolute',
  inset: `calc(env(safe-area-inset-top) + ${rem(64)}) 0 calc(env(safe-area-inset-bottom) + ${rem(80)})`,
  touchAction: 'pan-y pinch-zoom',
})

export const viewerClose = style({
  position: 'absolute',
  top: `calc(env(safe-area-inset-top) + ${vars.space.sm})`,
  right: vars.space.sm,
})

export const viewerNav = style({
  ...flexRow(16),
  position: 'absolute',
  left: '50%',
  bottom: `calc(env(safe-area-inset-bottom) + ${vars.space.md})`,
  alignItems: 'center',
  transform: 'translateX(-50%)',
})

export const viewerPosition = style({
  minWidth: rem(56),
  textAlign: 'center',
  font: font('14/20', 500),
  color: color.text('inverse'),
  fontVariantNumeric: 'tabular-nums',
})
