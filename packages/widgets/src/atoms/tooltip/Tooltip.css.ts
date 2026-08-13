import { style, styleVariants } from '@vanilla-extract/css'
import { color, font, media, rem, transition } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'

/**
 * Обёртка вокруг триггера. `inline-flex`, а не `block`: подсказка чаще всего
 * оборачивает кнопку, стоящую в строке с ценой, и лишний блочный бокс её бы
 * растянул на всю ширину футера карточки.
 */
export const container = style({
  position: 'relative',
  display: 'inline-flex',
})

/** Растяжка под `Button isFullWidth`: без неё обёртка ужимает кнопку по содержимому. */
export const block = style({
  display: 'flex',
  width: '100%',
})

/**
 * Пузырь. Скрыт `visibility`, а не `display`: так работает переход, а сам
 * пузырь при этом не ловит курсор в скрытом состоянии.
 *
 * `pointer-events: none` — курсор проходит насквозь: подсказка всплывает
 * впритык к кнопке, и без этого она перехватывала бы клик по ней самой.
 */
export const bubble = style({
  position: 'absolute',
  zIndex: vars.zIndex.tooltip,
  width: 'max-content',
  maxWidth: rem(240),
  padding: `${rem(6)} ${rem(10)}`,
  font: font('12/16', 500),
  color: color.text('inverse'),
  backgroundColor: color.surface('inverse', 0.92),
  borderRadius: vars.radius.sm,
  boxShadow: vars.shadow.lg,
  textAlign: 'center',
  pointerEvents: 'none',
  visibility: 'hidden',
  opacity: 0,
  transition: transition('opacity', 'visibility', 'transform'),
  selectors: {
    /*
      Наведение — на обёртке, фокус — на чём угодно внутри неё. Второе важнее
      первого: недоступная кнопка остаётся в табуляции именно ради этого, и на
      клавиатуре подсказка — единственный способ узнать причину.
    */
    [`${container}:hover &, ${container}:focus-within &`]: {
      visibility: 'visible',
      opacity: 1,
      transform: 'translateX(-50%) translateY(0)',
    },
  },
  ...media({
    preferReducedMotion: { transition: 'none' },
  }),
})

/**
 * Смещение по вертикали задаётся `transform`, а не `top`/`bottom`: анимируется
 * только он, и подсказка выезжает из-под триггера, а не проявляется на месте.
 */
export const placement = styleVariants({
  top: {
    bottom: '100%',
    left: '50%',
    marginBottom: rem(8),
    transform: 'translateX(-50%) translateY(4px)',
  },
  bottom: {
    top: '100%',
    left: '50%',
    marginTop: rem(8),
    transform: 'translateX(-50%) translateY(-4px)',
  },
})
