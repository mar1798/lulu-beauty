import { keyframes, style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn } from '../../styling/mixin'
import { focusVisibleRing } from '../../styling/mixin/focusRing'
import { vars } from '../../styling/themes/contract.css'
import { SHOWCASE_BEAM_DURATION_MS } from '../../utils/motion'

/** Толщина рамки, px. Она же — отступ поверхности от края плитки. */
const BORDER = 1.5

/**
 * Бегущая линия — вращающийся конический градиент под белой поверхностью.
 *
 * Не `@property --angle` с анимацией самого угла: это красивее, но требует
 * регистрации Houdini-свойства, а у vanilla-extract для `@property` нет API —
 * пришлось бы объявлять его сырым `globalStyle`-хаком. И не `offset-path:
 * rect()`, которым такой приём делают в свежих подборках: поддержка у него
 * заметно уже, чем у остального в этом файле.
 *
 * Поэтому классический способ: квадрат с коническим градиентом крутится под
 * поверхностью, а наружу видна только его кромка — на неё приходится padding
 * плитки. `overflow: hidden` срезает углы этого квадрата по скруглению.
 */
const sweep = keyframes({
  from: { transform: 'translate(-50%, -50%) rotate(0turn)' },
  to: { transform: 'translate(-50%, -50%) rotate(1turn)' },
})

/**
 * Плитка. Форма и материал — как у карточки товара: белая поверхность, та же
 * ступень скругления, та же тень. Отличается она не материалом, а тем, что
 * внутри: стрелка вместо фотографии и бегущая рамка, которой у товара нет.
 *
 * Сам контейнер — это рамка и есть: его фон виден полосой в `padding` и служит
 * рамкой в покое (и при `prefers-reduced-motion`, когда луч выключен).
 */
export const container = style([
  {
    position: 'relative',
    display: 'flex',
    height: '100%',
    padding: rem(BORDER),
    borderRadius: vars.radius.xxl,
    /* Срезает углы вращающегося квадрата по скруглению плитки. */
    overflow: 'hidden',
    backgroundColor: color.border('default'),
    boxShadow: vars.shadow.md,
    color: color.text('primary'),
    textDecoration: 'none',
  },
  focusVisibleRing(),
])

/**
 * Квадрат луча. 250 % — не «с запасом на глаз», а необходимый минимум: при
 * вращении прямоугольник накрывает плитку целиком, только если половина его
 * меньшей стороны не меньше половины диагонали плитки. Для ленты (190×326) это
 * 2.5 × 190 = 475 против диагонали 377 — сходится.
 *
 * Градиент — узкая дуга: длинный прозрачный участок и короткий яркий. Именно
 * это и читается как бегущая линия; широкая дуга превратила бы её в
 * поворачивающуюся подсветку.
 */
export const beam = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '250%',
  height: '250%',
  background: `conic-gradient(from 0turn, transparent 0turn 0.62turn, ${color.brand(
    '300'
  )} 0.74turn, ${color.brand('600')} 0.8turn, ${color.brand(
    '300'
  )} 0.86turn, transparent 0.98turn 1turn)`,
  animationName: sweep,
  animationDuration: `${SHOWCASE_BEAM_DURATION_MS}ms`,
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
  ...media({
    /*
      Без движения луча нет вовсе — не остановленный, а убранный: замерший
      градиент оставил бы на рамке случайное яркое пятно, которое ничего не
      значит. Рамкой остаётся фон контейнера.
    */
    preferReducedMotion: { display: 'none' },
  }),
})

/**
 * За кадром луч встаёт. Классом, а не инлайновым `animation-play-state`, — по
 * той же причине, что у `Float`: инлайн сильнее любого объявления в файле и
 * пережил бы выключение анимации медиазапросом, а класс остаётся частью
 * каскада наравне с ним.
 */
export const beamPaused = style({
  animationPlayState: 'paused',
})

/**
 * Белая поверхность поверх луча. Внутренний радиус на толщину рамки меньше
 * внешнего — иначе углы поверхности «протыкают» углы плитки.
 */
export const surface = style({
  ...flexColumn(4),
  position: 'relative',
  flex: 1,
  justifyContent: 'flex-end',
  padding: `calc(${vars.space.md} - ${rem(BORDER)})`,
  borderRadius: `calc(${vars.radius.xxl} - ${rem(BORDER)})`,
  backgroundColor: color.surface('base'),
  transition: transition('background-color'),
  ...media({
    hoverAnimatable: {
      selectors: {
        [`${container}:hover &`]: { backgroundColor: color.brand('50') },
      },
    },
  }),
})

/**
 * Стрелка прижата к верху и крупная: в ряду без фотографий она — единственное,
 * что читается с расстояния, и именно она отличает плитку от карточки.
 */
export const icon = style({
  display: 'flex',
  marginBottom: 'auto',
  fontSize: rem(24),
  color: color.text('brand'),
})

export const label = style({
  font: font('15/20', 600),
  letterSpacing: vars.tracking.body,
})

export const hint = style({
  font: font('12/16'),
  color: color.text('muted'),
})
