import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import * as floatStyles from '../../atoms/float/Float.css'
import { flexColumn, flexRow } from '../../styling/mixin'
import { wrapperPadding } from '../../styling/properties.css'
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
 * Выход текста — только от `SPLIT`. На телефоне лесенка держала заголовок,
 * описание и кнопку невидимыми до 0.6 с после первой отрисовки: LCP сдвигался на
 * полсекунды-секунду, и CTA появлялся не сразу. Там текст стоит на месте с
 * первого кадра; задержки `animationDelay` инлайном без анимации ни на что не
 * влияют.
 */
const splitEntrance = (
  name: string,
  extra: Parameters<typeof media>[0] = {}
): ReturnType<typeof media> =>
  media({
    ...extra,
    [SPLIT]: { animationName: name },
    preferReducedMotion: { animation: 'none' },
  })

/**
 * Ширина, с которой герой раскладывается в две колонки. `lg`, а не `md`: в
 * правой колонке стоит ряд из трёх карточек с названием, маркой и ценой, и на
 * 768px каждой досталось бы около 110px — товар на такой карточке уже не
 * рассматривают. До `lg` витрина остаётся лентой под текстом.
 */
const SPLIT = 'lg'

/**
 * Высота первого экрана. Разная по ширинам, и это осознанно.
 *
 * **От `SPLIT` — полный экран.** Там герой раскладывается в две колонки, и
 * контент — текст с таймером слева, витрина справа — занимает его целиком:
 * пустоты, из-за которой полноэкранный герой первой редакции читался как
 * заставка, больше нет.
 *
 * **До `SPLIT` — потолок в `clamp()`.** На телефоне всё то же самое встаёт в
 * одну колонку и получается заметно выше экрана, так что полная высота ничего
 * не добавила бы, а пол в 560px не даёт герою схлопнуться в полоску на лежащем
 * телефоне.
 *
 * Единицы — `svh`, не `vh` и не `dvh`. На iOS `100vh` считается без адресной
 * строки, и низ героя уезжает под неё. `dvh` низ не режет, но пересчитывается
 * на каждый показ/скрытие панелей Safari: при скролле высота героя меняется, и
 * весь блок скачет. `svh` — высота при *развёрнутых* панелях: она постоянна,
 * поэтому ничего не дёргается. `vh` остаётся запасным значением для браузеров
 * без вьюпортных единиц нового поколения — и в нём же, внутри `@supports`,
 * продублирована развилка по ширине: иначе на широком экране с поддержкой
 * `svh` исход спора двух правил решал бы порядок блоков в бандле.
 */
export const container = style({
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  minHeight: `clamp(${rem(560)}, 86vh, ${rem(920)})`,
  paddingTop: `calc(env(safe-area-inset-top) + ${rem(96)})`,
  paddingBottom: `calc(env(safe-area-inset-bottom) + ${vars.space.xl})`,
  ...media({
    [SPLIT]: { minHeight: '100vh' },
  }),
  '@supports': {
    '(min-height: 100svh)': {
      minHeight: `clamp(${rem(560)}, 86svh, ${rem(920)})`,
      ...media({
        [SPLIT]: { minHeight: '100svh' },
      }),
    },
  },
})

/** Шапка в потоке, а не поверх героя: отступ под неё не нужен. */
export const containerFlush = style({
  paddingTop: `calc(env(safe-area-inset-top) + ${vars.space.xl})`,
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
  gap: rem(32),
})

/**
 * Раскладка в две колонки. Отдельным классом, а не свойством `content`:
 * без витрины (`showcase` не передан) герой обязан остаться одноколоночным —
 * иначе текст ужался бы в половину экрана ради пустого места рядом.
 *
 * `minmax(0, …)` у обеих колонок — обязательный: колонка грида по умолчанию не
 * уже своего содержимого, и лента карточек с `overflow-x` раздула бы правую
 * колонку по сумме их ширин, вытолкнув текст.
 */
export const contentSplit = style({
  ...media({
    [SPLIT]: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.02fr) minmax(0, 0.98fr)',
      alignItems: 'center',
      gap: vars.space.xxl,
    },
  }),
})

/** Левая колонка: заголовочный блок и нижняя строка едут разными слоями. */
export const copy = style({
  ...flexColumn(32),
  minWidth: 0,
})

/**
 * Заголовочный блок. Собственных авто-отступов у него нет: вертикаль всей
 * композиции держат `content` и `copy`, иначе разрыв снова стал бы функцией
 * высоты экрана.
 */
export const top = style({
  ...flexColumn(16),
})

/** Метка состояния сбора над заголовком. */
export const badge = style({
  display: 'flex',
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  ...splitEntrance(fadeUp),
})

/**
 * Display-кегль — токены-строки с `clamp()`, поэтому отдельные свойства, а не
 * хелпер `font()` (тот принимает только целые пиксели).
 *
 * От `SPLIT` кегль переходит на `displaySplit`. Дело не в величине, а в
 * множителе: `display` — это `7vw`, то есть доля **экрана**, а строка с этой
 * ширины стоит в половине его. `displaySplit` пересчитан на колонку, поэтому
 * слоган остаётся строкой, а не расползается в четыре.
 */
export const heading = style({
  fontFamily: vars.font.display,
  fontWeight: 600,
  fontSize: vars.fontSize.display,
  lineHeight: vars.lineHeight.display,
  letterSpacing: vars.tracking.display,
  color: color.text('primary'),
  ...media({
    [SPLIT]: {
      fontSize: vars.fontSize.displaySplit,
      lineHeight: vars.lineHeight.displaySm,
    },
  }),
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
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: HERO_LINE_EASING,
  animationFillMode: 'both',
  ...splitEntrance(lineRise),
})

/** 44ch, а не 52: в половинной колонке строка длиннее уже не дочитывается. */
export const description = style({
  font: font('16/24'),
  color: color.text('secondary'),
  maxWidth: '44ch',
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  ...splitEntrance(fadeUp, { md: { font: font('18/28') } }),
})

/** Таймер, кнопки и приписка выходят вместе, последней ступенью лесенки. */
export const bottom = style({
  ...flexColumn(24),
  alignItems: 'flex-start',
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  ...splitEntrance(fadeUp),
})

/**
 * Слот сбора. До ревизии 3 он звался `aside` и стоял в правом нижнем углу
 * вровень с кнопками; теперь это блок в самой композиции, над действием.
 * Своей типографики у слота по-прежнему нет: панель держится сменой материала,
 * а не кеглем, и набирает цифры сама (`DeadlineCountdown variant="blocks"`).
 *
 * Ширины слот тоже не навязывает: её держит сама панель (`StatusPanel` —
 * `fit-content` на любом экране). Здесь осталось только то, что без обёртки не
 * работает: `max-width`, чтобы длинная панель не распирала колонку.
 */
export const status = style({
  maxWidth: '100%',
})

export const actions = style({
  ...flexRow(12),
  flexWrap: 'wrap',
  width: '100%',
  ...media({
    md: { width: 'auto' },
  }),
})

/** Приписка под кнопками: счётчики каталога. */
export const note = style({
  font: font('13/18'),
  color: color.text('muted'),
  maxWidth: '44ch',
})

/**
 * Правая колонка. До `SPLIT` она идёт под текстом, поэтому отрицательные
 * поля: лента карточек обязана доезжать до края экрана, иначе последняя
 * карточка упирается в поле `Container` и лента читается как обрезанная
 * сетка. Отступы возвращаются внутрь самой ленты (`showcaseRow`), чтобы
 * первая карточка встала по общей левой линии страницы.
 *
 * Мера — `wrapperPadding`, а не ступень шкалы отступов. Своего горизонтального
 * padding у `Container` нет вовсе: канаву задаёт его ширина
 * (`min(100vw - 40px, 1128px)`), то есть на телефоне это 20px, а не 16px
 * `space.md`. С шагом шкалы лента не доезжала до края четырёх пикселей, а
 * первая карточка вставала левее заголовка — ровно то, против чего здесь
 * отрицательные поля.
 */
export const showcase = style({
  minWidth: 0,
  marginInline: `calc(-1 * ${wrapperPadding})`,
  ...media({
    [SPLIT]: { marginInline: 0 },
  }),
})

/**
 * Лента до `SPLIT`, ряд из трёх — после.
 *
 * `align-items: flex-end` в ряду держит карточки на одной нижней линии: у них
 * разной длины названия, и без этого ряд «съезжал» бы по низу.
 */
export const showcaseRow = style({
  display: 'flex',
  /*
    Все карточки ленты — по самой высокой. Явно, а не наследством от `normal`:
    выравнивание здесь несущее, а не умолчание, — в ряду с названиями разной
    длины карточки иначе расходятся по высоте, и лента читается как набор
    разных плиток.
  */
  alignItems: 'stretch',
  gap: vars.space.sm,
  overflowX: 'auto',
  paddingInline: wrapperPadding,
  paddingBottom: vars.space.xs,
  /*
    `proximity`, а не `mandatory`: лента кончается плиткой другой ширины, и
    обязательный снап на ней отбирает у пальца последний кусок хода.
    Второй снап в репозитории (`AdminLayout`) по той же причине мягкий.
  */
  scrollSnapType: 'x proximity',
  /*
    Снап считает от края *скроллпорта*, а не от поля ленты: без этого первая
    карточка стояла бы с отступом, а любая следующая после снапа — вплотную к
    краю экрана, и левая линия ленты прыгала бы при каждой прокрутке.
  */
  scrollPaddingInline: wrapperPadding,
  /* Лента прокручивается пальцем; полосу под ней в этом кадре не показываем. */
  scrollbarWidth: 'none',
  animationName: fadeUp,
  animationDuration: `${HERO_LINE_DURATION_MS}ms`,
  animationTimingFunction: 'ease-out',
  animationFillMode: 'both',
  selectors: {
    '&::-webkit-scrollbar': { display: 'none' },
  },
  ...media({
    [SPLIT]: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      alignItems: 'flex-end',
      overflowX: 'visible',
      paddingInline: 0,
      scrollPaddingInline: 0,
    },
    preferReducedMotion: { animation: 'none' },
  }),
})

/**
 * Сами карточки приходят слотом, то есть своего класса у героя на них нет —
 * отсюда `globalStyle` (обычные селекторы vanilla-extract умеют целиться
 * только в собственный класс). Ширина задана здесь, а не на карточке: это
 * свойство ленты, а не товара.
 */
globalStyle(`${showcaseRow} > *`, {
  flex: '0 0 clamp(146px, 44vw, 190px)',
  scrollSnapAlign: 'start',
  ...media({
    [SPLIT]: { flex: 'initial' },
  }),
})

/**
 * Два правила для слоя левитации, и оба — про то, что лента и кластер живут по
 * разным законам. Селектор адресный (`> ${floatStyles.container}`), а не
 * `> *`: он обязан перебивать собственные свойства `Float`, а при равной
 * специфичности исход решал бы порядок файлов в бандле.
 *
 * **В ленте левитации нет.** Карточки стоят в строку, их низы на одной линии —
 * и вертикальный сдвиг в пару пикселей читается там не как дыхание, а как
 * разъехавшаяся вёрстка: «карточки разного размера». В кластере тот же сдвиг
 * читается правильно, потому что карточки там и так намеренно на разной
 * высоте.
 *
 * Высоту здесь не трогаем вовсе: её решает `align-items` ряда — `stretch` в
 * ленте (все по самой высокой) и `flex-end` в кластере (каждая по содержимому,
 * низы на одной линии). Своей высоты у `Float` нет как раз для того, чтобы это
 * работало.
 */
globalStyle(`${showcaseRow} > ${floatStyles.container}`, {
  animationName: 'none',
  ...media({
    [SPLIT]: { animationName: floatStyles.floatAnimation },
  }),
})

/**
 * Замыкающая плитка — только на телефоне.
 *
 * Прячется с `md`, то есть уже на планшете, а не на `SPLIT` вместе с
 * переходом в кластер. Ширина, с которой лента перестаёт быть тесной, и
 * ширина, на которой витрина становится кластером, — разные: от `md` карточки
 * ленты умещаются на экране почти целиком, обрыва в конце не видно, и плитка
 * превращается в лишний повтор кнопки «смотреть каталог» из левой колонки.
 * Нужна она там, где лента реально упирается в край, — на телефоне.
 */
export const showcaseMore = style({
  ...media({
    md: { display: 'none' },
  }),
})

/**
 * Один герой в кластере: ряд одинаковых карточек читается как обрезок сетки
 * каталога, а приподнятая середина — как витрина. Подъём — `margin-bottom`, а
 * не `transform`: transform на этом элементе занят левитацией (`Float`), и
 * статический сдвиг молча перетёр бы её.
 */
globalStyle(`${showcaseRow} > *:nth-child(2)`, {
  ...media({
    [SPLIT]: { marginBottom: rem(28) },
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
