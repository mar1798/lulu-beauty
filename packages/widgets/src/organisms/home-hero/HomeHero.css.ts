import { keyframes, style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'
import {
  HERO_DECOR_DURATION_MS,
  HERO_HINT_LOOP_DURATION_MS,
  HERO_HINT_OFFSET,
  HERO_LINE_DURATION_MS,
  HERO_LINE_EASING,
  REVEAL_OFFSET,
} from '../../utils/motion'

/**
 * Выход героя — CSS-анимации, как у `Appear`: они начинаются с первой
 * отрисовки статики и не ждут гидратации. При `prefers-reduced-motion`
 * анимации выключаются целиком — контент виден сразу и полностью.
 */

/** Строка заголовка выезжает из-под маски: типографский приём, а не fade. */
const lineRise = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
})

const fadeUp = keyframes({
  from: { opacity: 0, transform: `translateY(${REVEAL_OFFSET}px)` },
  to: { opacity: 1, transform: 'translateY(0)' },
})

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

/** Фон стартует раньше всех и идёт дольше: к концу выхода текста он уже стоит. */
const decorIn = keyframes({
  from: { opacity: 0, transform: 'scale(1.06)' },
  to: { opacity: 1, transform: 'scale(1)' },
})

const hintFloat = keyframes({
  '0%': { transform: 'translateY(0)' },
  '50%': { transform: `translateY(${HERO_HINT_OFFSET}px)` },
  '100%': { transform: 'translateY(0)' },
})

const reducedOff = media({ preferReducedMotion: { animation: 'none' } })

/**
 * `100svh`, не `100vh` и не `100dvh`. На iOS `100vh` считается без адресной
 * строки, и низ героя — а там кнопки и таймер — уезжает под неё. `100dvh`
 * низ не режет, но пересчитывается на каждый показ/скрытие панелей Safari:
 * при скролле высота героя меняется, и весь блок скачет. `100svh` — высота
 * при *развёрнутых* панелях: она постоянна, поэтому ничего не дёргается, а
 * контент виден целиком в самом тесном состоянии вьюпорта. `100vh` остаётся
 * запасным значением для браузеров без вьюпортных единиц нового поколения.
 */
export const container = style({
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  paddingTop: `calc(env(safe-area-inset-top) + ${rem(96)})`,
  paddingBottom: `calc(env(safe-area-inset-bottom) + ${vars.space.lg})`,
  '@supports': {
    '(min-height: 100svh)': { minHeight: '100svh' },
  },
})

export const background = style({
  position: 'absolute',
  inset: 0,
  animationName: decorIn,
  animationDuration: `${HERO_DECOR_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  ...reducedOff,
})

export const inner = style({
  ...flexColumn(),
  position: 'relative',
  flex: 1,
})

export const content = style({
  ...flexColumn(),
  flex: 1,
  justifyContent: 'center',
  gap: rem(24),
})

/**
 * Заголовочный блок. Собственных авто-отступов у него больше нет: вертикаль
 * всей композиции держит `content` (см. `CONTENT_GAP`), иначе разрыв снова
 * стал бы функцией высоты экрана.
 */
export const top = style({
  ...flexColumn(16),
})

/**
 * Display-кегль — токены-строки с `clamp()`, поэтому отдельные свойства, а не
 * хелпер `font()` (тот принимает только целые пиксели).
 */
export const heading = style({
  fontFamily: vars.font.eloqua,
  fontWeight: 600,
  fontSize: vars.fontSize.display,
  lineHeight: vars.lineHeight.display,
  letterSpacing: vars.tracking.display,
  color: color.text('primary'),
})

/**
 * Маска строки. Нижний компенсирующий отступ нужен из-за `lineHeight` < 1:
 * без него `overflow: hidden` срезал бы выносные элементы «у», «р», «д».
 */
export const lineMask = style({
  display: 'block',
  overflow: 'hidden',
  paddingBottom: '0.12em',
  marginBottom: '-0.12em',
})

export const line = style({
  display: 'block',
  animationName: lineRise,
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: HERO_LINE_EASING,
  animationFillMode: 'both',
  ...reducedOff,
})

export const description = style({
  font: font('16/24'),
  color: color.text('secondary'),
  maxWidth: '52ch',
  animationName: fadeUp,
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  ...media({
    md: { font: font('18/28') },
    preferReducedMotion: { animation: 'none' },
  }),
})

/** Кнопки и таймер выходят вместе, последней ступенью лесенки. */
export const bottom = style({
  ...flexColumn(24),
  animationName: fadeUp,
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  ...media({
    md: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    preferReducedMotion: { animation: 'none' },
  }),
})

export const actions = style({
  ...flexRow(12),
  flexWrap: 'wrap',
})

/**
 * Слот сбора. Своей типографики у него больше нет: в слоте стоит
 * `StatusPanel`, она держится сменой материала и набирает цифры сама
 * (`DeadlineCountdown variant="blocks"`). За слотом осталось только
 * положение: на мобильном — во всю ширину под кнопками, от `md` — прижат к
 * правому краю нижней строки (её раскладывает `bottom`).
 */
export const aside = style({
  width: '100%',
  ...media({
    md: { width: 'auto' },
  }),
})

export const hint = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: vars.space.lg,
  font: font('13/18', 500),
  color: color.text('muted'),
  animationName: fadeIn,
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  /*
    `backwards`, а не `both`: залитый `forwards` конец анимации (`opacity: 1`)
    в каскаде сильнее обычных объявлений и намертво перебивал бы `hintHidden`
    — индикатор оставался бы на экране после скролла. `backwards` держит
    начальное состояние только на время задержки, а дальше стиль снова
    решает каскад, и прозрачность становится переходимой.
  */
  animationFillMode: 'backwards',
  /* Плавное скрытие после первого скролла — прозрачностью, без размонтирования. */
  transition: `opacity ${HERO_LINE_DURATION_MS}ms ease-out`,
  ...media({
    /* Без движения индикатор не показывается вовсе: подсказывать ему нечего. */
    preferReducedMotion: { display: 'none' },
  }),
})

export const hintHidden = style({
  opacity: 0,
})

export const hintIcon = style({
  fontSize: rem(16),
  animationName: hintFloat,
  animationDuration: `${HERO_HINT_LOOP_DURATION_MS}ms`,
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
  selectors: {
    /*
      Спрятанный индикатор перестаёт качаться. Бесконечная анимация иначе
      тикала бы в композиторе всё время, что открыта вкладка, — а индикатор
      после первого скролла не нужен и больше не показывается.
    */
    [`${hintHidden} &`]: { animationPlayState: 'paused' },
  },
})
