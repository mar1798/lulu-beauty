import { keyframes, style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Дорожка из двух одинаковых рядов, сдвинутая на свою половину, — к концу
 * анимации первый ряд стоит ровно там, где в её начале стоял второй, и цикл
 * бесшовный.
 */
const marquee = keyframes({
  from: { transform: 'translateX(0)' },
  to: { transform: 'translateX(-50%)' },
})

/**
 * Маска затухания по краям — единственный «градиент» страницы: это не цвет,
 * а прозрачность, чтобы имена не обрывались резко на границе контейнера.
 */
export const container = style({
  overflow: 'hidden',
  maskImage:
    'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
  ...media({
    /*
      Без движения лента становится обычной прокручиваемой строкой: бренды за
      краем экрана остаются достижимыми пальцем и клавиатурой.
    */
    preferReducedMotion: {
      overflowX: 'auto',
    },
  }),
})

export const track = style({
  ...flexRow(),
  width: 'max-content',
  animationName: marquee,
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
  selectors: {
    /* Пауза и по наведению, и по фокусу — иначе по ссылке не попасть. */
    [`${container}:hover &, ${container}:focus-within &`]: {
      animationPlayState: 'paused',
    },
  },
  ...media({
    preferReducedMotion: {
      animationName: 'none',
    },
  }),
})

/**
 * За кадром лента стоит: бесконечная анимация иначе тикала бы в композиторе
 * всё время, что открыта вкладка. Классом, а не инлайном, — инлайновый
 * `animation-play-state` перебил бы паузу по `:hover`/`:focus-within`.
 */
export const trackPaused = style({
  animationPlayState: 'paused',
})

export const row = style({
  ...flexRow(48),
  alignItems: 'baseline',
  listStyle: 'none',
  paddingInline: rem(24),
})

export const link = style([
  {
    font: font('22/28', 600, 'eloqua'),
    letterSpacing: vars.tracking.display,
    color: color.text('secondary'),
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: transition('color'),
    selectors: {
      '&:hover': {
        color: color.text('primary'),
        textDecorationLine: 'underline',
        textUnderlineOffset: rem(6),
      },
    },
  },
  focusVisibleRing(),
])
