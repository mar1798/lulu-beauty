import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Сцена — утопленная площадка во всю ширину карточки шага. Все «предметы»
 * внутри собраны из прямоугольников, пилюль и существующих иконок; текст
 * заменён полосками, чтобы сцена узнавалась силуэтом, а не читалась.
 */
export const container = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  height: rem(132),
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.xl,
})

/** Полоска-заменитель текста. Ширину задаёт модификатор. */
export const bar = style({
  display: 'block',
  height: rem(8),
  borderRadius: vars.radius.pill,
  backgroundColor: color.neutral('300'),
})

export const barWide = style({ width: rem(72) })

export const barMid = style({ width: rem(56) })

export const barNarrow = style({ width: rem(44) })

/** Полоска цены — короткая и чуть темнее: цифры «весят» больше названия. */
export const barPrice = style({
  width: rem(28),
  backgroundColor: color.neutral('400'),
})

/** Марочная полоска суммы в строке «Итого». */
export const barTotal = style({
  width: rem(36),
  height: rem(8),
  borderRadius: vars.radius.pill,
  backgroundColor: color.brand('400'),
})

/* --- cart: товар кладут в корзину --- */

export const cartCard = style({
  ...flexColumn(6),
  position: 'absolute',
  left: rem(16),
  top: rem(14),
  padding: rem(10),
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.sm,
})

/** Серый прямоугольник-«фото» товара. */
export const cartPhoto = style({
  display: 'block',
  width: rem(72),
  height: rem(48),
  borderRadius: vars.radius.sm,
  backgroundColor: color.neutral('200'),
})

/** Пилюля «+1» поверх правого верхнего угла карточки. */
export const plusPill = style({
  ...flexRow(),
  alignItems: 'center',
  position: 'absolute',
  top: rem(-8),
  right: rem(-12),
  padding: `${rem(2)} ${rem(8)}`,
  font: font('12/16', 600),
  color: color.text('inverse'),
  backgroundColor: color.brand('600'),
  borderRadius: vars.radius.pill,
})

export const cartCorner = style({
  position: 'absolute',
  top: rem(16),
  right: rem(20),
})

export const cartIcon = style({
  fontSize: rem(24),
  color: color.text('secondary'),
})

/** Круглый бейдж-счётчик у корзины. */
export const cartBadge = style({
  ...flexRow(),
  alignItems: 'center',
  justifyContent: 'center',
  position: 'absolute',
  top: rem(-6),
  right: rem(-8),
  width: rem(16),
  height: rem(16),
  font: font('10/12', 600),
  color: color.text('inverse'),
  backgroundColor: color.brand('600'),
  borderRadius: vars.radius.circle,
})

/* --- request: корзина превращается в заявку --- */

export const requestRows = style({
  ...flexColumn(8),
  position: 'absolute',
  left: rem(16),
  top: rem(18),
  width: rem(132),
})

export const requestRow = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
})

export const requestDivider = style({
  display: 'block',
  height: rem(1),
  backgroundColor: color.border('subtle'),
})

export const totalLabel = style({
  font: font('12/16', 600),
  color: color.text('secondary'),
})

/** Пилюля «Заявка» — итог сцены, приходит с «поп»-пружинием. */
export const requestPill = style({
  ...flexRow(),
  alignItems: 'center',
  position: 'absolute',
  right: rem(16),
  bottom: rem(16),
  padding: `${rem(4)} ${rem(12)}`,
  font: font('12/16', 600),
  color: color.text('brand'),
  backgroundColor: color.brand('100'),
  borderRadius: vars.radius.pill,
})

/* --- confirm: решение приходит в чат --- */

/**
 * Пузырь сообщения: один угол острее остальных — «хвостик» чата.
 * Вертикаль — фиксированным `top`, не `translateY(-50%)`: это motion-элемент,
 * и его transform занят анимацией входа.
 */
export const bubble = style({
  ...flexRow(12),
  alignItems: 'center',
  position: 'absolute',
  left: rem(16),
  top: rem(36),
  padding: rem(14),
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  borderBottomLeftRadius: vars.radius.sm,
  boxShadow: vars.shadow.sm,
})

export const bubbleCheck = style({
  ...flexRow(),
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: rem(32),
  height: rem(32),
  fontSize: rem(16),
  color: color.text('inverse'),
  backgroundColor: color.brand('600'),
  borderRadius: vars.radius.circle,
})

export const bubbleLines = style({
  ...flexColumn(6),
})

/* --- handover: товар получен --- */

/* Вертикаль фиксированным `top` — transform у motion-элементов занят входом. */
export const boxTile = style({
  ...flexRow(),
  alignItems: 'center',
  justifyContent: 'center',
  position: 'absolute',
  left: rem(16),
  top: rem(34),
  width: rem(64),
  height: rem(64),
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
})

export const boxIcon = style({
  fontSize: rem(28),
  color: color.text('secondary'),
})

export const checkList = style({
  ...flexColumn(10),
  position: 'absolute',
  left: rem(96),
  top: rem(43),
})

export const checkRow = style({
  ...flexRow(8),
  alignItems: 'center',
})

export const checkDot = style({
  ...flexRow(),
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: rem(18),
  height: rem(18),
  fontSize: rem(10),
  color: color.text('inverse'),
  backgroundColor: color.success('500'),
  borderRadius: vars.radius.circle,
})
