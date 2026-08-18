import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { color, font, media, rem } from '../../styling/lib'
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

const OFFSET = 4

/**
 * Горизонтальная поправка: на сколько пузырь отодвинут от центра триггера,
 * чтобы не упереться в край экрана. Считает и выставляет её инлайном
 * `Tooltip.tsx` — CSS не умеет узнать, где именно на экране стоит триггер.
 * По умолчанию нулевая: пузырь остаётся центрованным.
 */
export const shiftVar = '--tooltip-shift'

/** Центрирование вместе с поправкой — один `translateX` на все состояния. */
const centered = `translateX(calc(-50% + var(${shiftVar}, 0px)))`

/**
 * Проявление пузыря.
 *
 * Раньше это был `transition` по `opacity`/`visibility`, но из `display: none`
 * (см. `bubble`) переход не играет — проявление живёт в keyframes. Их два, по
 * одному на направление выезда: `transform` у направлений разный, а анимация
 * обязана вести его целиком, иначе она затрёт горизонтальное центрирование.
 */
const revealTop = keyframes({
  from: { opacity: 0, transform: `${centered} translateY(${OFFSET}px)` },
  to: { opacity: 1, transform: `${centered} translateY(0)` },
})

const revealBottom = keyframes({
  from: { opacity: 0, transform: `${centered} translateY(-${OFFSET}px)` },
  to: { opacity: 1, transform: `${centered} translateY(0)` },
})

/**
 * Пузырь. Скрыт `display: none`, а не `visibility: hidden`, намеренно.
 *
 * Скрытый по `visibility` бокс остаётся в раскладке и попадает в область
 * прокрутки документа. В сетке каталога подсказка висит над круглой кнопкой
 * карточки, ширина у неё до 240px — и в правой колонке её половина уезжала за
 * правый край телефона, растягивая документ по горизонтали. Каталог и
 * избранное начинали ездить вбок при том, что видимого содержимого за краем
 * нет (на главной то же самое пряталось за обрезкой секции — оттого и не
 * замечалось). `display: none` убирает пузырь из раскладки совсем.
 *
 * Шире экрана он не бывает и в раскрытом виде — `100vw` минус поля.
 *
 * `pointer-events: none` — курсор проходит насквозь: подсказка всплывает
 * впритык к кнопке, и без этого она перехватывала бы клик по ней самой.
 */
export const bubble = style({
  display: 'none',
  position: 'absolute',
  zIndex: vars.zIndex.tooltip,
  width: 'max-content',
  maxWidth: `min(${rem(240)}, calc(100vw - ${rem(32)}))`,
  padding: `${rem(6)} ${rem(10)}`,
  font: font('12/16', 500),
  color: color.text('inverse'),
  backgroundColor: color.surface('inverse', 0.92),
  borderRadius: vars.radius.sm,
  boxShadow: vars.shadow.lg,
  textAlign: 'center',
  pointerEvents: 'none',
  /*
    Анимация объявлена на скрытом состоянии и запускается сама, когда пузырь
    появляется: у `display: none` анимации не играют вовсе. Поэтому в селекторе
    ниже остаётся только показ — направление выезда приходит от `placement`.
  */
  animationDuration: '160ms',
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  selectors: {
    /*
      Наведение — на обёртке, фокус — на чём угодно внутри неё. Второе важнее
      первого: недоступная кнопка остаётся в табуляции именно ради этого, и на
      клавиатуре подсказка — единственный способ узнать причину.
    */
    [`${container}:hover &, ${container}:focus-within &`]: {
      display: 'block',
    },
  },
  /*
    При `prefers-reduced-motion` гасим длительность, а не `animation-name`:
    имя задаёт `placement` таким же одноклассовым правилом, и перебить его
    отсюда можно было бы только порядком в файле.
  */
  ...media({
    preferReducedMotion: { animationDuration: '1ms' },
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
    transform: centered,
    animationName: revealTop,
  },
  bottom: {
    top: '100%',
    left: '50%',
    marginTop: rem(8),
    transform: centered,
    animationName: revealBottom,
  },
})
