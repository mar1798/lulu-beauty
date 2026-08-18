/**
 * Значения дизайн-токенов светлой темы.
 *
 * Этот модуль — единственный источник правды по структуре темы: из него
 * строится и контракт (`contract.css.ts`), и сама тема (`light.css.ts`),
 * поэтому расхождение ключей, на котором падает `createTheme`, невозможно.
 *
 * Импорты из `../lib` только точечные (`../lib/rem`, `../lib/shadow`), а не
 * через бочку `../lib/index`: та тянет `lib/color.ts`, который импортирует
 * `contract.css.ts` — получилось бы кольцо tokens → lib → color → contract →
 * tokens, и `color` инициализировался бы до готовности `vars`.
 *
 * Цвета хранятся как каналы `'R, G, B'` — этого требует геттер `color()`
 * из `lib/color.ts`, который собирает `rgb(...)` / `rgba(...)`.
 *
 * Нейтральная шкала, поверхности, тени, скругления и трекинг сняты с
 * `DESIGN.md` («floating shopping constellation on white marble»): белый холст
 * `#f2f4f5`, белые карточки, чернильный текст, волосяные границы `#ebebeb`,
 * мягкие двухслойные тени вместо рамок. Марочная (пастельный лилово-розовый) и
 * акцентная (глина) шкалы плюс семантика оставлены прежними — единственный
 * насыщенный цвет системы у нас свой, а не violet из референса.
 */
import { rem } from '../lib/rem'
import { shadow, uniteShadows } from '../lib/shadow'

const HEX_RADIX = 16,
  RED_SHIFT = 16,
  GREEN_SHIFT = 8,
  BYTE = 255

/**
 * `'1e1c19'` → `'30, 28, 25'`. Локальный аналог `prepColor` из `lib/color.ts`,
 * заведён здесь, чтобы не импортировать `lib/color.ts` (см. коммент выше).
 */
function channels(hex: string): string {
  const value = parseInt(hex, HEX_RADIX)

  return [(value >> RED_SHIFT) & BYTE, (value >> GREEN_SHIFT) & BYTE, value & BYTE].join(', ')
}

/**
 * Тень одного уровня. В референсе тени строго чёрные (`rgba(0,0,0,α)`) —
 * тёплый подмес нейтрального 900 делал их грязными на холодном холсте.
 */
function ink(alpha: number): string {
  return `rgba(0, 0, 0, ${alpha})`
}

/**
 * Тень, подкрашенная марочным цветом: референс тонирует тень под акцентной
 * кнопкой её же оттенком, чтобы акцент читался и в подсветке. Violet заменён
 * на нашу марку.
 */
function brandGlow(alpha: number): string {
  return `rgba(${channels('a9587e')}, ${alpha})`
}

export const lightTokens = {
  color: {
    /**
     * Нейтральная шкала холста: белый → `canvas mist` → волосяная граница →
     * `cool stone` → `muted gray` → `slate ink` → чернильный чёрный.
     * Опорные значения (`f2f4f5`, `ebebeb`, `cccccc`, `787574`, `332f2d`,
     * `000000`) взяты из DESIGN.md один в один, промежуточные добраны, чтобы
     * шкала осталась равномерной.
     */
    neutral: {
      '0': channels('ffffff'),
      '50': channels('f8f9fa'),
      '100': channels('f2f4f5'),
      '200': channels('ebebeb'),
      '300': channels('e0e0e0'),
      '400': channels('cccccc'),
      '500': channels('787574'),
      /**
       * Чуть темнее референсного `#787574`: на холсте `#f2f4f5` тот даёт 4.18:1,
       * ниже WCAG AA 4.5:1 (ловится axe). На `#6f6c6b` выходит 4.76:1 при том же
       * оттенке, поэтому мелкий текст берёт 600, а иконки в покое — 500.
       */
      '600': channels('6f6c6b'),
      '700': channels('4d4a48'),
      '800': channels('332f2d'),
      '900': channels('141414'),
      '950': channels('000000'),
    },
    /** Марка: пастельный лилово-розовый. */
    brand: {
      '50': channels('fdf7fa'),
      '100': channels('faedf3'),
      '200': channels('f2d8e5'),
      '300': channels('e7bbd1'),
      '400': channels('d897b6'),
      '500': channels('c4739a'),
      '600': channels('a9587e'),
      '700': channels('8a4463'),
      '800': channels('67334a'),
      '900': channels('442131'),
    },
    /** Акцент: тёплая глина/песок для вторичных блоков и бейджей. */
    accent: {
      '50': channels('fbf6f0'),
      '100': channels('f4e9da'),
      '200': channels('e8d3b9'),
      '300': channels('d9b78f'),
      '400': channels('c69763'),
      '500': channels('ae7b45'),
      '600': channels('8e6136'),
      '700': channels('6d4a2a'),
      '800': channels('4c341e'),
      '900': channels('2e2013'),
    },
    success: {
      '100': channels('e4f1e9'),
      '300': channels('a8d3bb'),
      '500': channels('3d8f62'),
      '700': channels('2a6244'),
    },
    warning: {
      '100': channels('fbeeda'),
      '300': channels('efcb8b'),
      '500': channels('c98a21'),
      '700': channels('8e6013'),
    },
    /**
     * У опасного единственная из семантических шкал ступень `900`: только он
     * встречается заливкой под белым текстом (кнопка «удалить»), а заливка
     * обязана быть не светлее 700 (по 500 белым выходит 4.38:1 — мимо AA), и
     * тогда наведению нужна ступень темнее самой заливки.
     */
    danger: {
      '100': channels('fae7e5'),
      '300': channels('f0b3ad'),
      '500': channels('c9524a'),
      '700': channels('8e3630'),
      '900': channels('68251f'),
    },
    info: {
      '100': channels('e5edf8'),
      '300': channels('aec5e8'),
      '500': channels('3d6fb5'),
      '700': channels('2a4e7f'),
    },
    /**
     * Поверхности: карточки, панели, модалки. Основная — чистый белый, от
     * холста её отделяет мягкая тень, а не рамка (см. `shadow`).
     */
    surface: {
      base: channels('ffffff'),
      muted: channels('f8f9fa'),
      sunken: channels('f2f4f5'),
      soft: channels('faedf3'),
      inverse: channels('000000'),
      overlay: channels('000000'),
    },
    /** Фоны страницы и крупных секций. */
    background: {
      page: channels('f2f4f5'),
      soft: channels('f2d8e5'),
      inverse: channels('000000'),
    },
    text: {
      primary: channels('000000'),
      secondary: channels('332f2d'),
      /**
       * Нейтральный 600, а не 500: подсказками под полями и счётчиками
       * набирается мелкий текст, и на референсном 500 (`#787574`) контраст
       * на холсте падает до 4.18:1 — ниже требуемых WCAG AA 4.5:1. На 600
       * выходит 4.76:1 на холсте и 5.2:1 на белом.
       */
      muted: channels('6f6c6b'),
      subtle: channels('acaaa9'),
      inverse: channels('ffffff'),
      brand: channels('a9587e'),
      danger: channels('c9524a'),
      success: channels('3d8f62'),
    },
    /**
     * Границы — волосяные: `#ebebeb` из референса на разделителях и полях,
     * `cool stone` на сильном состоянии. Фокус остаётся марочным.
     */
    border: {
      subtle: channels('ebebeb'),
      default: channels('e0e0e0'),
      strong: channels('cccccc'),
      focus: channels('c4739a'),
      inverse: channels('332f2d'),
    },
  },
  font: {
    inter: `var(--font-inter, Inter, sans-serif)`,
    eloqua: `var(--font-eloqua, Eloqua, sans-serif)`,
  },
  /**
   * Трекинг. Подпись референса: иерархию держит не жир, а отрицательный
   * трекинг — крупный текст стягивается сильнее мелкого.
   */
  tracking: {
    tight: '-0.05em',
    display: '-0.03em',
    body: '-0.011em',
    none: '0',
    wide: '0.04em',
  },
  /**
   * Скругления: `xxl` (28px) — карточки, `xl` (20px) — картинка внутри
   * карточки (референс держит внутренний радиус на ~8px меньше внешнего),
   * `pill` — всё, что стоит в строке с текстом: кнопки, поля, чипы.
   */
  radius: {
    none: '0',
    xs: rem(4),
    sm: rem(8),
    md: rem(12),
    lg: rem(16),
    xl: rem(20),
    xxl: rem(28),
    pill: '9999px',
    circle: '50%',
  },
  /**
   * Тени из референса: `md` — фирменная двухслойная «подушка» под карточками,
   * `sm` — лёгкий подъём пилюль и чипов, `lg` — плавающие элементы вроде
   * стрелок каруселей. `brand` подкрашена маркой (см. `brandGlow`).
   */
  shadow: {
    none: 'none',
    xs: shadow('out', 0, 1, 2).colorize(ink(0.05)),
    sm: shadow('out', 0, 2, 8).colorize(ink(0.06)),
    md: uniteShadows(
      shadow('out', 0, 4, 6, -1).colorize(ink(0.1)),
      shadow('out', 0, 2, 4, -2).colorize(ink(0.1)),
    ),
    lg: shadow('out', 0, 4, 24).colorize(ink(0.12)),
    xl: uniteShadows(
      shadow('out', 0, 12, 48).colorize(ink(0.16)),
      shadow('out', 0, 4, 12).colorize(ink(0.08)),
    ),
    brand: shadow('out', 0, 4, 24).colorize(brandGlow(0.34)),
    inset: shadow('in', 0, 1, 2).colorize(ink(0.06)),
  },
  /** Слои: header ниже drawer, drawer ниже модалки, тост поверх всего. */
  zIndex: {
    base: '0',
    raised: '1',
    dropdown: '100',
    sticky: '200',
    header: '300',
    drawer: '400',
    overlay: '500',
    modal: '600',
    popover: '700',
    toast: '800',
    tooltip: '900',
  },
  space: {
    none: '0',
    xxs: rem(4),
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
    xxl: rem(48),
    xxxl: rem(64),
    /**
     * Две ступени сверх `xxxl` — вертикальный ритм секций главной. После
     * полноэкранного героя 64px между секциями читаются как слипшиеся:
     * масштаб первого экрана задаёт ожидание воздуха. `huge` — мобильный
     * ритм, `giant` — от `md`. Остальным страницам эти ступени не нужны.
     */
    huge: rem(96),
    giant: rem(128),
  },
  /**
   * Display-шкала героя главной. Хелпер `font()` принимает только целые
   * пиксели и не умеет `clamp()`, а лестница брейкпоинтов на таком кегле
   * даёт скачки при повороте телефона — поэтому размеры заведены строками
   * и применяются через отдельные `fontSize`/`lineHeight`, а не `font()`.
   */
  fontSize: {
    /*
      Кегль слогана в герое. Меньше первой редакции (`10vw`, до 6.5rem): там
      заголовок был плакатом на всю ширину, теперь это короткая строка-слоган,
      и прежний кегль ломал бы её переносами на узких экранах.
    */
    display: 'clamp(2.25rem, 7vw, 4.5rem)',
    displaySm: 'clamp(2rem, 6vw, 3.5rem)',
    /** Кегль таймера в герое: меньше заголовка, крупнее любого текста сайта. */
    counter: 'clamp(1.75rem, 5vw, 3rem)',
  },
  /**
   * Меньше единицы — только для display: на таком кегле межстрочное 1.2
   * разваливает заголовок на несвязанные полосы.
   */
  lineHeight: {
    display: '0.98',
    displaySm: '1.02',
  },
  /**
   * Непрозрачность фонового декоративного слоя главной. Одна тройка значений
   * на всю страницу, чтобы пятна пяти секций не разошлись при первой правке:
   * `decor` — под текстом, `decorStrong` — где текста над пятном нет,
   * `halo` — пастельный ореол-градиент под баночкой.
   *
   * Не 0.16/0.24, как в первой редакции: тогда пятно было огромным и
   * приглушалось до призрака, а маленькая баночка у края на такой
   * прозрачности читается как грязь на холсте, а не как товар.
   */
  opacity: {
    decor: '0.38',
    decorStrong: '0.55',
    halo: '0.5',
  },
  /**
   * Ступени размера фоновых пятен. Потолок в px — несущая часть инварианта
   * «товар виден целиком»: свободная ширина в процентах секции (то есть в vw)
   * на 1920px раздувала баночку до ~900px по высоте, и секция её резала.
   * `clamp()` держит пятно читаемым на 375px и не даёт расти на широком
   * экране; других размеров у пятна не бывает.
   */
  decor: {
    sizeSm: 'clamp(88px, 11vw, 148px)',
    sizeMd: 'clamp(112px, 14vw, 196px)',
    sizeLg: 'clamp(136px, 17vw, 248px)',
  },
}
