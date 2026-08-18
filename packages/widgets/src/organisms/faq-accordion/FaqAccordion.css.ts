import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style(flexColumn())

export const row = style({
  borderBottom: border(1, color.border('subtle')),
  selectors: {
    '&:first-child': { borderTop: border(1, color.border('subtle')) },
  },
})

/** Заголовок структуры — без собственного кегля: его задаёт кнопка. */
export const heading = style({
  margin: 0,
})

/**
 * Кнопка занимает всю строку — зона нажатия не меньше 44px и на всю ширину:
 * на телефоне в аккордеон попадают пальцем, а не курсором.
 */
export const trigger = style([
  {
    ...flexRow(16),
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: rem(56),
    padding: `${vars.space.md} 0`,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    color: color.text('primary'),
  },
  focusVisibleRing(),
])

export const question = style({
  font: font('18/24', 600, 'eloqua'),
  letterSpacing: vars.tracking.display,
})

export const chevron = style({
  flexShrink: 0,
  fontSize: rem(20),
  color: color.text('brand'),
  transition: transition('transform'),
  /* Шеврон — часть раскрытия: без движения он должен просто переключаться. */
  ...media({ preferReducedMotion: { transition: 'none' } }),
})

export const chevronOpen = style({
  transform: 'rotate(180deg)',
})

/** `overflow: hidden` — суть анимации высоты: ответ выезжает из-под маски. */
export const panel = style({
  overflow: 'hidden',
})

export const panelBody = style({
  paddingBottom: vars.space.lg,
})

export const answer = style({
  font: font('16/24'),
  color: color.text('secondary'),
  maxWidth: '64ch',
})
