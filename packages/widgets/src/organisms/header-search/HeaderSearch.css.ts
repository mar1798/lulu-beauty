import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import {
  fieldInput,
  fieldShell,
  flexColumn,
  flexRow,
  focusVisibleRing,
  visuallyHidden,
} from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Поиск занимает свободную середину шапки, но не растёт бесконечно: на
 * широком экране поле в 480px уже выглядит как поле поиска, а не как пустая
 * полоса между логотипом и корзиной.
 */
export const container = style({
  minWidth: 0,
  /*
    До `lg` в строке стоит одна лупа, и растягиваться контейнеру нельзя:
    `flex-grow` забирает всё свободное место раньше, чем до него доходит
    `margin-right: auto` логотипа, и между логотипом и корзиной открывается
    пустая полоса шириной с поле, которого там нет.
  */
  ...media({
    lg: {
      flexGrow: 1,
      maxWidth: rem(480),
      marginLeft: 'auto',
    },
  }),
})

/**
 * Лупа вместо поля на узком экране.
 *
 * Внешность повторяет кнопку корзины в шапке по той же причине, по которой та
 * повторяет `IconButton`: эти три кнопки стоят в одной строке, и любое
 * расхождение по размеру или радиусу читается как чужой контрол.
 */
export const trigger = style([
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: rem(40),
    height: rem(40),
    fontSize: rem(20),
    color: color.text('secondary'),
    background: 'none',
    border: 'none',
    borderRadius: vars.radius.circle,
    cursor: 'pointer',
    transition: transition('background-color', 'color'),
    selectors: {
      '&:hover': {
        backgroundColor: color.surface('sunken'),
        color: color.text('primary'),
      },
    },
    ...media({
      lg: { display: 'none' },
    }),
  },
  focusVisibleRing(),
])

/**
 * Поле в строке шапки. До `lg` его там нет — стоят логотип, аккаунт, корзина
 * и бургер, и пятый элемент в эту строку не помещается ни на каком телефоне.
 * Вместо него лупа, открывающая панель (`overlay` ниже).
 */
export const field = style({
  display: 'none',
  ...media({
    lg: { display: 'block' },
  }),
})

/**
 * Панель поиска на узком экране — та же раскладка, что у `MobileMenu`, и это
 * намеренно: обе открываются кнопкой из шапки, и разъехавшиеся между собой
 * «шторка меню» и «шторка поиска» читались бы как два разных приложения.
 * Затемнение прижато к верху, панель приезжает сверху, открытый низ экрана
 * остаётся зоной закрытия — по нему удобно попасть большим пальцем.
 */
export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: vars.zIndex.drawer,
  display: 'flex',
  alignItems: 'flex-start',
  backgroundColor: color.surface('overlay', 0.45),
  /* Панель нужна только там, где в шапке спрятано поле. */
  ...media({
    lg: { display: 'none' },
  }),
})

/**
 * Высота видимой части экрана — над клавиатурой. Пишет её `HeaderSearch` из
 * `visualViewport`: `100dvh` клавиатуру не учитывает, и последние подсказки,
 * «Показать всё» и «Отправить пожелание» оставались под ней, куда не долистать.
 *
 * Литеральное имя, а не `createVar()` — по той же причине, что в `Float.css.ts`:
 * значение ставится инлайном, и нужно голое имя.
 */
export const VISIBLE_HEIGHT_PROPERTY = '--search-visible-height'

export const panel = style({
  ...flexColumn(0),
  width: '100%',
  maxHeight: `var(${VISIBLE_HEIGHT_PROPERTY}, 100dvh)`,
  backgroundColor: color.surface('base'),
  borderBottomLeftRadius: vars.radius.xxl,
  borderBottomRightRadius: vars.radius.xxl,
  boxShadow: vars.shadow.xl,
  /* Ловушка фокуса ставит фокус на саму панель, если внутри фокусировать нечего. */
  outline: 'none',
})

/** Шапка панели — высотой ровно в шапку сайта, как у `MobileMenu`. */
export const panelHead = style({
  ...flexRow(12),
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: rem(72),
  paddingInline: vars.space.md,
  borderBottom: border(1, color.border('subtle')),
})

export const panelField = style({
  padding: vars.space.md,
})

/**
 * Выдача в панели — обычным потоком, без портала и без привязки к координатам
 * поля: всплывающий список поверх экранной клавиатуры показывать негде.
 * Прокручивается она, а не вся панель, чтобы поле не уезжало из виду.
 */
export const panelResults = style({
  flexGrow: 1,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: `0 ${vars.space.xs} ${vars.space.sm}`,
})

export const shell = style([
  fieldShell(),
  {
    // Ниже штатных 44px: шапка высотой 72px, и поле в полную высоту контрола
    // прижималось бы к её краям вплотную.
    minHeight: rem(40),
    selectors: {
      // Открытый список подсвечивает поле как сфокусированное — иначе не
      // видно, чему принадлежит висящая под шапкой выдача.
      '&[data-open="true"]': { borderColor: color.border('focus') },
    },
  },
])

export const icon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: rem(18),
  height: rem(18),
  fontSize: rem(18),
  color: color.text('muted'),
})

export const input = style([
  fieldInput(),
  {
    // Нативный крестик Safari/Chrome у `type="search"` — у нас своя кнопка,
    // и два крестика подряд в одном поле выглядят как ошибка вёрстки.
    selectors: {
      '&::-webkit-search-cancel-button': { display: 'none' },
    },
  },
])

export const clear = style({
  flexShrink: 0,
  marginRight: rem(-8),
})

/** Список — портал с `fixed` по координатам поля, ровно как у `Combobox`. */
export const popover = style({
  position: 'fixed',
  zIndex: vars.zIndex.popover,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: vars.space.xxs,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.xl,
})

/** Точка, от которой список «вырастает»: всегда со стороны поля. */
export const origin = styleVariants({
  bottom: { transformOrigin: 'top center' },
  top: { transformOrigin: 'bottom center' },
})

export const list = style({
  ...flexColumn(2),
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

/** Подпись группы: «Категории», «Бренды», «Товары». */
export const groupTitle = style({
  padding: `${rem(8)} ${vars.space.sm} ${rem(2)}`,
  font: font('12/18', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  color: color.text('muted'),
})

export const option = style({
  borderRadius: vars.radius.md,
  transition: transition('background-color'),
})

/**
 * Подсветка «на что нажмётся» одна и для мыши, и для клавиатуры: фокус
 * остаётся в поле (`aria-activedescendant`), своей рамки у строки нет.
 */
export const active = style({
  backgroundColor: color.surface('sunken'),
})

/** Последняя строка — «показать всё»: отбита от выдачи и без картинки. */
export const allResults = style({
  marginTop: rem(4),
  borderTop: border(1, color.border('subtle')),
  borderRadius: 0,
})

export const row = style([
  {
    ...flexRow(10),
    alignItems: 'center',
    padding: `${rem(6)} ${vars.space.sm}`,
    font: font('15/22'),
    color: color.text('secondary'),
    textDecoration: 'none',
    borderRadius: vars.radius.md,
  },
  focusVisibleRing(),
])

/** Квадрат под фотографию: `contain`, как и в карточке товара. */
export const thumb = style({
  position: 'relative',
  flexShrink: 0,
  width: rem(40),
  height: rem(40),
  overflow: 'hidden',
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.sm,
})

export const thumbPlaceholder = style({
  position: 'absolute',
  inset: 0,
  margin: 'auto',
  fontSize: rem(18),
  color: color.text('muted'),
})

export const text = style({
  ...flexColumn(0),
  minWidth: 0,
  flexGrow: 1,
})

export const label = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: color.text('primary'),
})

export const hint = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  font: font('12/18'),
  color: color.text('muted'),
})

export const price = style({
  ...flexColumn(0),
  alignItems: 'flex-end',
  flexShrink: 0,
})

export const stock = style({
  font: font('11/16'),
  color: color.text('muted'),
})

/**
 * «Ничего не нашлось»: подсказка, а не строка списка — нажимать в ней не на
 * что, кроме ссылки на Instagram во второй строке.
 */
export const empty = style({
  ...flexColumn(2),
  padding: `${rem(10)} ${vars.space.sm}`,
  font: font('15/22'),
  color: color.text('muted'),
})

/**
 * Слот под пустой выдачей — форма пожелания.
 *
 * Отступы у него свои, а не от `empty`: тот выключка по левому краю списка
 * строк, а здесь стоит блок с собственной рамкой, и общий `padding` списка
 * прижал бы его к краям попапа.
 */
export const emptySlot = style({
  paddingInline: rem(2),
})

/** Единственное кликабельное место подсказки — потому и подчёркнуто. */
export const emptyLink = style([
  {
    color: color.text('brand'),
    textDecoration: 'underline',
    borderRadius: vars.radius.sm,
    transition: transition('color'),
    ':hover': {
      color: color.brand('700'),
    },
  },
  focusVisibleRing(),
])

/** Постоянная скрытая область «Найдено: N» — см. `HeaderSearch`. */
export const liveRegion = style(visuallyHidden())
