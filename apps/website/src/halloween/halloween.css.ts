import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { font, media, rem } from 'widgets/styling/lib'
import { wrapperPadding, wrapperWidth } from 'widgets/styling/properties'
import { vars } from 'widgets/styling/theme'
import {
  HALLOWEEN_ASSETS,
  HALLOWEEN_ATTRIBUTE,
  HALLOWEEN_CANVAS,
  HALLOWEEN_PAUSED_ATTRIBUTE,
} from './config'

/**
 * Все стили хэллоуинского декора — одним файлом, чтобы после сезона его можно
 * было убрать вместе с папкой, не выискивая правила по страницам.
 *
 * Два рода правил. Классы сцен (`HalloweenScene`, `HalloweenLayer`) работают
 * только там, где сцена отрисована, а сцена при выключенном флаге — `null`.
 * Глобальные правила (фон, паутинки и свечение карточек, декор галереи товара)
 * висят на атрибуте `data-halloween` у `<html>`: без него они не совпадают ни
 * с чем, и классы-«крючки», которые страницы раздают своим блокам, остаются
 * пустыми.
 *
 * Декор никогда не ловит событий и не поднимается выше выпадающих списков
 * (`vars.zIndex.dropdown`): всё, что здесь двигается, — фон, а не интерфейс.
 */

const ON = `html[${HALLOWEEN_ATTRIBUTE}]`

/** Узкий экран — то, что в макете зовётся мобильной версией (< 768px). */
const MOBILE = `screen and (max-width: ${rem(767.98)})`

const url = (path: string): string => `url("${path}")`

/* --- Глобально: «сумерки» --- */

globalStyle(ON, {
  backgroundColor: HALLOWEEN_CANVAS,
})

/**
 * Холст держит только `<html>`. Свой фон `body` рисуется обычным блоком — и
 * закрыл бы виньетку и паутину, которые лежат под содержимым на `z-index: -1`.
 */
globalStyle(`${ON} body`, {
  backgroundColor: 'transparent',
})

/* --- Общие детали сцен --- */

/**
 * Любой элемент декора: абсолютный, без событий и без выделения. Ширину
 * задаёт класс места, высота идёт от пропорций картинки (`width`/`height` у
 * `<img>` известны заранее, поэтому ничего не прыгает при загрузке).
 */
export const item = style({
  position: 'absolute',
  display: 'block',
  pointerEvents: 'none',
  userSelect: 'none',
})

export const image = style({
  display: 'block',
  width: '100%',
  height: 'auto',
})

/** Сцена — слой поверх своего блока: места в потоке не занимает. */
const scene = {
  position: 'absolute',
  pointerEvents: 'none',
} as const

const hiddenOnMobile = { '@media': { [MOBILE]: { display: 'none' } } } as const

/**
 * Блок, внутри которого стоит сцена, — точка отсчёта для `absolute`. Как и
 * остальные крючки, работает только при атрибуте: вне сезона страница не
 * получает даже лишнего `position: relative`, который поменял бы порядок
 * наложения в блоке.
 */
export const host = style({})

globalStyle(`${ON} ${host}`, {
  position: 'relative',
})

/* --- Шапка: подпись у логотипа --- */

/**
 * «Happy Halloween» над «Sululu», наискосок. Лежит `absolute` от обёртки
 * логотипа и места в шапке не занимает: над 32-пиксельной строкой названия
 * в 72-пиксельной шапке остаётся ~20px, подпись встаёт в них, чуть заходя
 * на верх букв. Тыквенный, но темнее самих тыкв: мелкий текст на светлой
 * шапке должен читаться. Скрыта без атрибута — см. `HalloweenHeaderNote`.
 *
 * На телефоне — справа от названия, в две строки: между «Sululu» и лупой
 * поиска на 360px ~70px, а в одну строку подпись ~85px и легла бы на лупу.
 */
export const headerNote = style({
  position: 'absolute',
  bottom: '100%',
  left: rem(14),
  marginBottom: rem(-7),
  display: 'none',
  font: font('10/12', 600),
  letterSpacing: '0.04em',
  color: '#b4531b',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none',
  transform: 'rotate(-7deg)',
  transformOrigin: 'left bottom',
  '@media': {
    [MOBILE]: {
      bottom: 'auto',
      top: '50%',
      left: `calc(100% + ${rem(6)})`,
      marginBottom: 0,
      maxWidth: 'min-content',
      whiteSpace: 'normal',
      transform: 'translateY(-50%) rotate(-7deg)',
      transformOrigin: 'center',
    },
  },
})

globalStyle(`${ON} ${headerNote}`, {
  display: 'block',
})

/* --- Глобальный слой: виньетка, паутина, пролёт мышей --- */

/**
 * Виньетка и паутина лежат **под** содержимым (`z-index: -1` в корневом
 * контексте наложения): затемняется только холст, а белые карточки, кнопки и
 * текст остаются ровно такими, как были.
 */
export const vignette = style({
  position: 'fixed',
  inset: 0,
  zIndex: -1,
  pointerEvents: 'none',
  background:
    'radial-gradient(ellipse 75% 70% at 50% 45%, transparent 55%, rgba(52, 36, 64, 0.2) 100%)',
})

/**
 * Паутина в верхних углах — сразу под шапкой и на месте при прокрутке. Высота
 * шапки — 73px на десктопе и 72px на телефоне (`Header.css.ts`).
 */
export const cobweb = style({
  position: 'fixed',
  top: rem(73),
  zIndex: -1,
  width: rem(180),
  opacity: 0.8,
  pointerEvents: 'none',
  userSelect: 'none',
  '@media': {
    [MOBILE]: { top: rem(72), width: rem(100) },
  },
})

export const cobwebLeft = style({ left: 0 })

/** Правый угол — тот же файл, отражённый. */
export const cobwebRight = style({ right: 0, transform: 'scaleX(-1)' })

/**
 * Летучая мышь пролёта. Один элемент на всё приложение: ждёт за левым верхним
 * краем, траекторию задаёт `element.animate` в `HalloweenLayer`. Над
 * содержимым, но под выпадающими списками, шапкой и модалками.
 */
export const flyingBat = style({
  position: 'fixed',
  display: 'block',
  top: 0,
  left: 0,
  zIndex: 50,
  width: rem(60),
  pointerEvents: 'none',
  userSelect: 'none',
  transform: 'translate(-200px, -200px)',
  // На телефоне мышь меньше: 60px там — заметная часть ширины экрана.
  '@media': {
    [MOBILE]: { width: rem(40) },
    '(prefers-reduced-motion: reduce)': { display: 'none' },
  },
})

/**
 * Встроенная мышь (`BatFlap`): ширину задаёт место, высота — из `viewBox`.
 * `overflow: visible` — взмах крыла и тень выходят за рамку рисунка.
 */
export const batSvg = style({
  display: 'block',
  width: '100%',
  height: 'auto',
  overflow: 'visible',
})

/** Взмах крыльев. Точки крепления — у плеч, в координатах `viewBox`. */
const flapLeftKeyframes = keyframes({
  from: { transform: 'rotate(0) scaleY(1)' },
  to: { transform: 'rotate(-16deg) scaleY(0.82)' },
})

const flapRightKeyframes = keyframes({
  from: { transform: 'rotate(0) scaleY(1)' },
  to: { transform: 'rotate(16deg) scaleY(0.82)' },
})

export const wing = style({
  animationDuration: '0.55s',
  animationTimingFunction: 'ease-in-out',
  animationDirection: 'alternate',
  animationIterationCount: 'infinite',
  ...media({ preferReducedMotion: { animation: 'none' } }),
})

export const wingLeft = style({
  transformOrigin: '178px 140px',
  animationName: flapLeftKeyframes,
})

export const wingRight = style({
  transformOrigin: '222px 140px',
  animationName: flapRightKeyframes,
})

/**
 * Пауза для всего, что двигается внутри: ставит её `Deco` вне экрана, а
 * пролёт — пока мышь ждёт за краем. Крылья встроенного SVG перерисовываются
 * на главном потоке каждый кадр (вместе с тенью-фильтром), и махать ими там,
 * где их никто не видит, — чистый расход.
 */
globalStyle(`[${HALLOWEEN_PAUSED_ATTRIBUTE}], [${HALLOWEEN_PAUSED_ATTRIBUTE}] *`, {
  animationPlayState: 'paused',
})

/* --- Анимации --- */

/** Паук качается на нитке: точка подвеса — сверху. */
const swingKeyframes = keyframes({
  from: { transform: 'rotate(-3deg)' },
  to: { transform: 'rotate(3deg)' },
})

export const swing = style({
  transformOrigin: 'top center',
  animationName: swingKeyframes,
  animationDuration: '3.2s',
  animationTimingFunction: 'ease-in-out',
  animationDirection: 'alternate',
  animationIterationCount: 'infinite',
  ...media({ preferReducedMotion: { animation: 'none' } }),
})

/* --- Каталог: карточки (по атрибуту) --- */

/**
 * Крючок на сетке каталога. Сам по себе пуст: всё, что он делает, включается
 * атрибутом `data-halloween`.
 */
export const catalogGrid = style({})

/*
  Только настоящие карточки (`ProductCard` — это `<article>`), не скелетоны:
  у скелетона нет `position`, и паутинка улетела бы к ближайшему
  позиционированному предку — на заголовок каталога.
*/
const card = `${ON} ${catalogGrid} > article`

/** Тёплое свечение на наведении: марочный `#a9587e` с лёгким оранжевым. */
globalStyle(`${card}`, {
  transitionDuration: '0.3s',
})

globalStyle(`${card}:hover`, {
  boxShadow: `${vars.shadow.lg}, 0 0 0 1px rgba(169, 88, 126, 0.1), 0 12px 36px rgba(169, 88, 126, 0.22), 0 4px 22px rgba(240, 146, 72, 0.16)`,
})

/**
 * Паутинка в левом верхнем углу каждой пятой карточки (индекс `i % 5 === 2`).
 * Слева — потому что справа сердце «в избранное»; сама паутинка прозрачная и
 * лежит на углу, а не на фото.
 */
globalStyle(`${card}:nth-child(5n + 3)::before`, {
  content: '""',
  position: 'absolute',
  top: rem(-3),
  left: rem(-3),
  zIndex: 2,
  width: rem(56),
  height: rem(56),
  backgroundImage: url(HALLOWEEN_ASSETS.cobweb),
  backgroundSize: 'contain',
  backgroundRepeat: 'no-repeat',
  opacity: 0.55,
  pointerEvents: 'none',
  '@media': {
    [MOBILE]: { width: rem(40), height: rem(40) },
  },
})

/* --- Паук под паутиной (телефон, главная и каталог) --- */

/**
 * На телефоне паук висит на правой паутине и прилипает к шапке вместе с ней:
 * `fixed` сразу под её нижней кромкой (72px). Узкий и прижат к самому краю
 * экрана: тело паука — в 20-пиксельном поле страницы, на краю карточек
 * только кончики лап. Над содержимым (иначе его закрывали бы карточки), но под
 * шапкой, выпадающими списками и мобильным меню. Событий не ловит.
 *
 * На планшете и десктопе его нет: там свои пауки — над фильтрами каталога и
 * над витриной героя.
 */
export const stickySpider = style({
  position: 'fixed',
  top: rem(72),
  right: 0,
  zIndex: 50,
  width: rem(24),
  display: 'none',
  '@media': { [MOBILE]: { display: 'block' } },
})

/* --- Каталог: сцена у заголовка --- */

/**
 * Полоса над фильтрами во всю ширину колонки, высотой 148px — ровно до
 * подписей фильтров. Декор в ней разнесён по ширине, а не собран в угол:
 * призрак — сразу за «Каталог», справа — паук. Тыкв
 * наверху нет. Остальное (свечи, тыквы, ещё призраки и мыши) — по бокам
 * сетки (`catalogSides`), в подвале и у пагинации.
 */
export const catalogTitle = style({
  ...scene,
  top: rem(24),
  left: 0,
  right: 0,
  height: rem(148),
  '@media': {
    /*
      На телефоне сцена отодвинута от правого края на 40px: там под паутиной
      висит паук (`stickySpider`), и призрак пришёлся бы ему под лапы.
    */
    [MOBILE]: { top: rem(20), left: 'auto', right: rem(40), width: rem(120), height: rem(96) },
  },
})

/** Сразу за заголовком: «Каталог» — ~160px, подпись под ним — ~180px. */
export const catalogGhost = style({
  left: rem(240),
  top: rem(4),
  width: rem(68),
  '@media': {
    [MOBILE]: { left: 'auto', right: rem(40), top: 0, width: rem(58) },
  },
})

/* --- Каталог: декор по бокам сетки --- */

/** С какой ширины у колонки есть боковые поля под декор (от 40px). */
const SIDES = `screen and (min-width: ${rem(1280)})`

/** Крючок на `CatalogTemplate`: по нему боковой слой узнаёт, есть ли товары. */
export const catalogPage = style({})

/**
 * Слой во всю ширину колонки (а не экрана) от конца баннера до пагинации: по
 * высоте он тянется вместе с сеткой, и декор, расставленный в процентах,
 * равномерно идёт вдоль неё на любой странице выдачи.
 *
 * `z-index: -1` — под карточками: там, где поле уже декора, тот выглядывает
 * из-за сетки, а не ложится на неё.
 *
 * Только когда в сетке есть второй ряд (8+ карточек): у короткой выдачи и
 * пустого результата боков нет, и декор столпился бы у формы пожелания.
 * Решает CSS, а не React, — смена фильтров слой не перемонтирует.
 */
export const catalogSides = style({
  ...scene,
  top: rem(380),
  bottom: rem(140),
  left: '50%',
  zIndex: -1,
  display: 'none',
  width: wrapperWidth,
  transform: 'translateX(-50%)',
})

globalStyle(`${ON} ${catalogPage}:has(${catalogGrid} > article:nth-child(8)) ${catalogSides}`, {
  '@media': { [SIDES]: { display: 'block' } },
})

/**
 * Отступ от края колонки в боковое поле шириной `wrapperPadding`. Где поле
 * шире картинки — она стоит посередине поля; где уже — прижата к краю экрана
 * и прячется остатком за сетку. За экран она не выходит никогда, поэтому и
 * горизонтальной прокрутки нет.
 */
const gutter = (width: number): string => {
  const room = `(${wrapperPadding} - ${rem(width)})`

  return `calc(100% + min(${room} / 2, ${room}))`
}

const leftSide = (top: string, width: number): Parameters<typeof style>[0] => ({
  top,
  right: gutter(width),
  width: rem(width),
})

const rightSide = (top: string, width: number): Parameters<typeof style>[0] => ({
  top,
  left: gutter(width),
  width: rem(width),
})

/*
  По пять с каждой стороны, со сдвигом на полшага между сторонами: в любом
  кадре прокрутки что-то есть и слева, и справа, но пары не стоят зеркально.
*/
export const sideLeft1 = style(leftSide('4%', 84))
export const sideRight1 = style(rightSide('14%', 110))
export const sideLeft2 = style(leftSide('24%', 100))
export const sideRight2 = style(rightSide('34%', 40))
export const sideLeft3 = style(leftSide('44%', 96))
export const sideRight3 = style(rightSide('54%', 90))
export const sideLeft4 = style(leftSide('64%', 80))
export const sideRight4 = style(rightSide('74%', 76))
export const sideLeft5 = style(leftSide('84%', 44))
export const sideRight5 = style(rightSide('92%', 72))

/**
 * Каждая вторая фигура — только у длинной выдачи (4+ ряда, 16+ карточек):
 * у двух-трёх рядов слой короткий, и десять фигур на нём стояли бы вплотную.
 */
export const sideExtra = style({ display: 'none' })

globalStyle(`${ON} ${catalogPage}:has(${catalogGrid} > article:nth-child(16)) ${sideExtra}`, {
  display: 'block',
})

/**
 * Паук над строкой фильтров. Окно с обрезкой — от низа шапки до верха
 * фильтров, поэтому как бы он ни спускался, на поле поиска и списки не
 * заедет: нижняя кромка окна стоит над ними.
 */
export const spiderWindow = style({
  ...scene,
  top: 0,
  right: rem(12),
  width: rem(110),
  height: rem(168),
  overflow: 'hidden',
  ...hiddenOnMobile,
})

/**
 * Спуск на прокрутке: первые 300px страницы паук опускается из-под шапки.
 * Только там, где браузер умеет scroll-driven анимации; остальные видят
 * паука висящим — и это и есть запасной вариант, а не поломка.
 */
const descendKeyframes = keyframes({
  from: { transform: 'translateY(-118px)' },
  to: { transform: 'translateY(-62px)' },
})

export const spiderDrop = style({
  position: 'absolute',
  top: 0,
  left: '50%',
  width: rem(68),
  marginLeft: rem(-34),
  transform: 'translateY(-118px)',
  '@supports': {
    '(animation-timeline: scroll())': {
      '@media': {
        '(prefers-reduced-motion: no-preference)': {
          animationName: descendKeyframes,
          animationTimingFunction: 'linear',
          animationFillMode: 'both',
          animationDuration: '1ms',
          animationTimeline: 'scroll(root)',
          animationRange: '0 300px',
        },
      },
    },
  },
})

/* --- Каталог: свеча в баннере «Приём заказов закрыт» --- */

/**
 * Свеча стоит в пустом хвосте строки текста врезки (~1090px). Он есть, только
 * пока врезка во всю ширину колонки (1200px — с экрана 1240px): уже текст
 * доходит до свечи, а затем переносится и тянется до правого края, поэтому
 * там свечи нет.
 */
export const bannerCandle = style({
  ...scene,
  top: '50%',
  right: rem(22),
  width: rem(40),
  marginTop: rem(-40),
  '@media': {
    [`screen and (max-width: ${rem(1239.98)})`]: { display: 'none' },
  },
})

/* --- Каталог: пагинация --- */

/**
 * Группа кнопок пагинации ~260px по центру строки; декор — по обе стороны.
 * На телефоне пагинация с подписью «1 из N» занимает почти всю ширину, и
 * декору там не остаётся места.
 */
export const paginationPumpkin = style({
  top: '50%',
  right: `calc(50% + ${rem(146)})`,
  width: rem(50),
  marginTop: rem(-27),
  ...hiddenOnMobile,
})

export const paginationBats = style({
  top: '50%',
  left: `calc(50% + ${rem(146)})`,
  width: rem(90),
  marginTop: rem(-34),
  ...hiddenOnMobile,
})

/* --- Карточка товара (по атрибуту) --- */

/** Крючок на `ProductDetails`: первый ребёнок — галерея, её первый — белый блок с фото. */
export const productDetails = style({})

const gallery = `${ON} ${productDetails} > :first-child`

/** Паутинка в левом верхнем углу белого блока с фото — внутри блока, поверх фото. */
globalStyle(`${gallery} > :first-child::after`, {
  content: '""',
  position: 'absolute',
  top: 0,
  left: 0,
  zIndex: 1,
  width: rem(64),
  height: rem(64),
  backgroundImage: url(HALLOWEEN_ASSETS.cobweb),
  backgroundSize: 'contain',
  backgroundRepeat: 'no-repeat',
  opacity: 0.6,
  pointerEvents: 'none',
})

/**
 * Тыква выглядывает из-за левого нижнего угла блока с фото. С `md`, где блок
 * тянется на всю колонку с пропорцией 4:5, — его низ тогда известен заранее:
 * `padding-top` в процентах считается от ширины колонки, и 125% — ровно
 * высота блока. До `md` блок центрирован и уже колонки, и тыкве не за что
 * спрятаться.
 */
globalStyle(gallery, {
  ...media({ md: { position: 'relative' } }),
})

globalStyle(`${gallery}::before`, {
  ...media({
    md: {
      content: '""',
      position: 'absolute',
      top: 0,
      left: rem(-34),
      zIndex: -1,
      width: rem(70),
      paddingTop: `calc(125% + ${rem(18)})`,
      backgroundImage: url(HALLOWEEN_ASSETS.pumpkin),
      backgroundSize: `${rem(70)} auto`,
      backgroundPosition: 'bottom left',
      backgroundRepeat: 'no-repeat',
      pointerEvents: 'none',
    },
  }),
})

/** Мышь справа на уровне хлебных крошек. */
export const productBat = style({
  top: rem(30),
  right: 0,
  width: rem(60),
  '@media': { [MOBILE]: { top: rem(22), width: rem(46) } },
})

/* --- Главная --- */

/**
 * Слой героя ложится в его `background`, а координаты считает от колонки
 * контента (`wrapperWidth`), а не от экрана: витрина стоит в правой половине
 * контейнера, и проценты от его ширины попадают в неё на любом десктопе.
 * По вертикали — от середины героя: содержимое центрировано по высоте.
 *
 * Только с `xl`: уже витрина переезжает под текст, и сцене не остаётся места.
 */
export const homeHero = style({
  ...scene,
  top: 0,
  bottom: 0,
  left: '50%',
  width: wrapperWidth,
  transform: 'translateX(-50%)',
  display: 'none',
  ...media({ xl: { display: 'block' } }),
})

/** Паук из-под шапки над средней карточкой витрины. */
export const homeSpider = style({
  top: 'calc(50% - 376px)',
  left: 'calc(76.5% - 37px)',
  width: rem(74),
})

/** Призрак между заголовком и первой карточкой. */
export const homeGhost = style({
  top: 'calc(50% - 280px)',
  left: '43.5%',
  width: rem(130),
})

/** Тыквы стоят под карточками, свечи — справа от них. */
export const homePumpkinFace = style({
  top: 'calc(50% + 196px)',
  left: '59%',
  width: rem(165),
})

export const homePumpkin = style({
  top: 'calc(50% + 252px)',
  left: 'calc(59% + 150px)',
  width: rem(110),
})

export const homeCandles = style({
  top: 'calc(50% + 200px)',
  left: 'calc(59% + 268px)',
  width: rem(130),
})

/**
 * Стайка у заголовка «Заявка вместо оплаты» — справа, над карточками шагов.
 * Отступ от правого края — место флакону medicube: он парит у самой кромки
 * колонки, и стайка поверх него читалась бы как наложение, а не соседство.
 */
export const homeStepsBats = style({
  right: rem(140),
  bottom: rem(-14),
  width: rem(150),
  '@media': { [MOBILE]: { width: rem(96), bottom: rem(-36) } },
})

/* --- Пустые состояния и заголовки списков --- */

/**
 * Над заголовком пустого состояния: у `EmptyState` сверху отступ 48px, и
 * нижняя кромка декора стоит чуть выше заголовка, а не на нём.
 */
export const emptyScene = style({
  ...scene,
  left: '50%',
  bottom: `calc(100% - ${rem(42)})`,
  display: 'flex',
  alignItems: 'flex-end',
  gap: rem(4),
  transform: 'translateX(-50%)',
})

/** Внутри ряда декор стоит в потоке, а не абсолютно: ряд сам центрирует пару. */
export const inRow = style({
  position: 'relative',
  flexShrink: 0,
})

export const emptyGhost = style({
  width: rem(110),
  '@media': { [MOBILE]: { width: rem(80) } },
})

/*
  Корзина и заявки — ниже призрака: у их шаблонов между подзаголовком страницы
  и пустым состоянием 24px, а не 48px, и декор выше 66px заезжал бы на текст
  подзаголовка.
*/
export const emptyPumpkinFace = style({
  width: rem(66),
})

export const emptyCandles = style({
  width: rem(52),
})

export const emptyBats = style({
  width: rem(96),
})

/**
 * Пустая выдача каталога — это форма пожелания шириной до 680px, прижатая
 * влево, а над ней почти вплотную фильтры. Призрак поэтому парит справа от
 * формы, на уровне её заголовка; на телефоне, где форма во всю ширину, — над
 * её правым верхним углом, куда заголовок не дотягивается.
 */
export const catalogEmptyGhost = style({
  top: rem(-8),
  left: rem(720),
  width: rem(120),
  '@media': {
    [`screen and (max-width: ${rem(1023.98)})`]: {
      top: 'auto',
      left: 'auto',
      right: rem(4),
      bottom: `calc(100% - ${rem(26)})`,
      width: rem(70),
    },
  },
})

/**
 * Вход: стайка сидит на верхней кромке карточки, над заголовком «Вход». Карточка шаблона —
 * точка отсчёта (`authHost`), а сам декор лежит в её содержимом.
 */
export const authHost = style({})

globalStyle(`${ON} ${authHost} > section`, {
  position: 'relative',
})

export const authBats = style({
  bottom: `calc(100% - ${rem(18)})`,
  left: rem(20),
  width: rem(120),
  '@media': { [MOBILE]: { width: rem(96) } },
})

/**
 * Справа от заголовка непустого списка: невысокая сцена на уровне `h1`.
 * На телефоне справа от заголовка места нет — там её нет.
 */
export const listTitle = style({
  ...scene,
  top: rem(30),
  right: 0,
  display: 'flex',
  alignItems: 'flex-end',
  gap: rem(6),
  height: rem(100),
  ...hiddenOnMobile,
})

export const listBats = style({
  width: rem(120),
  alignSelf: 'flex-start',
})

export const listPumpkin = style({
  width: rem(56),
})

/* --- Подвал --- */

/**
 * Тыквы и свечи стоят на верхней кромке чёрного подвала, справа в колонке
 * контента. Картинки чуть «утоплены» в кромку: у тыкв в файле есть тень под
 * донцем, и без этого они висели бы над подвалом.
 */
export const footer = style({
  ...scene,
  bottom: `calc(100% - ${rem(10)})`,
  left: '50%',
  width: wrapperWidth,
  height: 0,
  transform: 'translateX(-50%)',
})

export const footerRow = style({
  position: 'absolute',
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'flex-end',
  gap: 0,
})

export const footerPumpkinFace = style({
  width: rem(104),
  '@media': { [MOBILE]: { width: rem(56) } },
})

export const footerPumpkin = style({
  width: rem(70),
  marginLeft: rem(-14),
  '@media': { [MOBILE]: { width: rem(40), marginLeft: rem(-8) } },
})

export const footerCandles = style({
  width: rem(84),
  marginLeft: rem(-4),
  '@media': { [MOBILE]: { width: rem(44) } },
})
