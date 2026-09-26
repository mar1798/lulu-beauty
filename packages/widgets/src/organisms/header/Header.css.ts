import { globalStyle, style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexRow, focusVisibleRing } from '../../styling/mixin'
import { headerOffset } from '../../styling/properties.css'
import { vars } from '../../styling/themes/contract.css'

/**
 * Размытие под шапкой — только с `md`. На телефоне `backdrop-filter` на
 * прилипшем слое пересчитывается на каждом кадре прокрутки и заметно ест кадры,
 * а при почти непрозрачном фоне его и так почти не видно — там фон сплошной.
 */
export const container = style({
  position: 'sticky',
  top: 0,
  zIndex: vars.zIndex.header,
  backgroundColor: color.surface('base'),
  borderBottom: border(1, color.border('subtle')),
  ...media({
    md: {
      backgroundColor: color.surface('base', 0.92),
      backdropFilter: 'blur(12px)',
    },
  }),
})

/**
 * Режим «поверх героя»: `fixed`, а не `sticky`, — шапка не должна занимать
 * место в потоке, герой начинается от самого края экрана. Фон и граница
 * сняты: чернильный текст лежит прямо на светлом холсте, контраст не падает.
 */
export const floating = style({
  position: 'fixed',
  insetInline: 0,
  backgroundColor: 'transparent',
  backdropFilter: 'none',
  borderBottomColor: 'transparent',
  transition: transition('background-color', 'border-color'),
  /*
    Повтор под `md` не лишний: vanilla-extract выносит медиаправила в конец
    таблицы, и фон с размытием из `container` иначе перебил бы прозрачность.
  */
  ...media({
    md: { backgroundColor: 'transparent', backdropFilter: 'none' },
  }),
})

/** После прокрутки на высоту шапки возвращается обычный вид — см. `container`. */
export const floatingScrolled = style({
  backgroundColor: color.surface('base'),
  borderBottomColor: color.border('subtle'),
  ...media({
    md: {
      backgroundColor: color.surface('base', 0.92),
      backdropFilter: 'blur(12px)',
    },
  }),
})

/**
 * Шапка едет вместе со страницей, не прилипая.
 *
 * Нужно ровно одному окружению — встроенному браузеру Telegram на iOS. Там
 * WKWebView отдаёт странице всю высоту окна, а `fixed` и `sticky` рисует
 * только в области под своей панелью с адресом и обрезает по её границе. Пока
 * панель развёрнута, границы совпадают; стоит ей свернуться в пилюлю при
 * прокрутке, окно вырастает вверх, а область для шапки — нет, и над прилипшей
 * шапкой открывается полоса, по которой едет контент страницы. Закрыть её
 * нечем: всё, что выше этой границы, странице не принадлежит — ни `::before`
 * шапки, ни отдельный `fixed` там не рисуются, проверено на устройстве.
 *
 * Поэтому в этом окружении шапка липкости лишается: уезжающей шапке просвет
 * взяться неоткуда. `position: static` отменяет и режим «поверх героя» — он
 * тоже `fixed` и обрезается так же.
 */
export const unpinned = style({
  position: 'static',
})

export const inner = style({
  ...flexRow(16),
  alignItems: 'center',
  minHeight: rem(72),
})

/**
 * Отступ под прилипшую шапку (`headerOffset`) для всего, что прилипает под ней.
 * Только пока шапка прилипает: у `unpinned` (Telegram) она уезжает со страницей,
 * и отступ под неё оставил бы пустую полосу. `inner` в 72px плюс граница в 1px.
 */
globalStyle(`html:has(${container}:not(${unpinned}))`, {
  vars: { [headerOffset]: rem(73) },
})

export const logo = style([
  {
    font: font('24/32', 600, 'display'),
    letterSpacing: vars.tracking.tight,
    color: color.text('primary'),
    textDecoration: 'none',
    marginRight: 'auto',
    whiteSpace: 'nowrap',
  },
  focusVisibleRing(),
])

export const nav = style({
  ...flexRow(24),
  alignItems: 'center',
  display: 'none',
  marginRight: 'auto',
  ...media({
    lg: { display: 'flex' },
  }),
})

export const navLink = style([
  {
    font: font('16/24', 500),
    color: color.text('secondary'),
    textDecoration: 'none',
    transition: transition('color'),
    selectors: {
      '&:hover': { color: color.text('primary') },
      '&[aria-current="page"]': { color: color.text('brand') },
    },
  },
  focusVisibleRing(),
])

export const actions = style({
  ...flexRow(8),
  alignItems: 'center',
})

export const account = style([
  {
    ...flexRow(6),
    alignItems: 'center',
    font: font('14/20', 500),
    color: color.text('secondary'),
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    display: 'none',
    ...media({
      sm: { display: 'inline-flex' },
    }),
  },
  focusVisibleRing(),
])

/**
 * Корзина — ссылка, а не кнопка: вложить `<button>` внутрь `<a>` нельзя,
 * поэтому внешность иконочной кнопки повторена здесь напрямую.
 */
export const cart = style([
  {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: rem(40),
    height: rem(40),
    fontSize: rem(20),
    color: color.text('secondary'),
    borderRadius: vars.radius.circle,
    textDecoration: 'none',
    transition: transition('background-color', 'color'),
    selectors: {
      '&:hover': {
        backgroundColor: color.surface('sunken'),
        color: color.text('primary'),
      },
    },
  },
  focusVisibleRing(),
])

/** Счётчик поверх иконки корзины. */
export const cartCount = style({
  position: 'absolute',
  top: rem(-2),
  right: rem(-2),
  minWidth: rem(18),
  height: rem(18),
  padding: `0 ${rem(5)}`,
  font: font('11/18', 600),
  textAlign: 'center',
  color: color.text('inverse'),
  backgroundColor: color.brand('600'),
  borderRadius: vars.radius.pill,
  pointerEvents: 'none',
})

export const menuButton = style({
  ...media({
    lg: { display: 'none' },
  }),
})

/** Полоса под шапкой: дедлайн текущего сбора. */
export const notice = style({
  backgroundColor: color.background('soft'),
  color: color.brand('800'),
  font: font('14/20', 500),
  textAlign: 'center',
  padding: `${rem(6)} ${vars.space.md}`,
})
