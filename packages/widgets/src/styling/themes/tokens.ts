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
 * Палитра снята с `design-reference/` (тёплый кремовый фон, пастельная
 * лилово-розовая марка, глиняный акцент).
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
 * Тень одного уровня: цвет задаём каналами нейтрального 900 с альфой.
 */
function ink(alpha: number): string {
  return `rgba(${channels('1e1c19')}, ${alpha})`
}

export const lightTokens = {
  color: {
    /** Тёплая нейтральная шкала: фон страницы, текст, границы. */
    neutral: {
      '0': channels('ffffff'),
      '50': channels('fbf9f7'),
      '100': channels('f5f1ec'),
      '200': channels('eae4dc'),
      '300': channels('d9d1c6'),
      '400': channels('b8aea1'),
      '500': channels('918879'),
      '600': channels('6e665a'),
      '700': channels('4f4941'),
      '800': channels('33302b'),
      '900': channels('1e1c19'),
      '950': channels('100f0d'),
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
    danger: {
      '100': channels('fae7e5'),
      '300': channels('f0b3ad'),
      '500': channels('c9524a'),
      '700': channels('8e3630'),
    },
    info: {
      '100': channels('e5edf8'),
      '300': channels('aec5e8'),
      '500': channels('3d6fb5'),
      '700': channels('2a4e7f'),
    },
    /** Поверхности: карточки, панели, модалки. */
    surface: {
      base: channels('ffffff'),
      muted: channels('fbf9f7'),
      sunken: channels('f5f1ec'),
      soft: channels('faedf3'),
      inverse: channels('1e1c19'),
      overlay: channels('100f0d'),
    },
    /** Фоны страницы и крупных секций. */
    background: {
      page: channels('fbf9f7'),
      soft: channels('f2d8e5'),
      inverse: channels('1e1c19'),
    },
    text: {
      primary: channels('1e1c19'),
      secondary: channels('4f4941'),
      muted: channels('918879'),
      subtle: channels('b8aea1'),
      inverse: channels('ffffff'),
      brand: channels('a9587e'),
      danger: channels('c9524a'),
      success: channels('3d8f62'),
    },
    border: {
      subtle: channels('eae4dc'),
      default: channels('d9d1c6'),
      strong: channels('b8aea1'),
      focus: channels('c4739a'),
      inverse: channels('33302b'),
    },
  },
  font: {
    inter: `var(--font-inter, Inter, sans-serif)`,
    eloqua: `var(--font-eloqua, Eloqua, sans-serif)`,
  },
  /** Скругления: мягкие карточки товаров и pill-бейджи из референса. */
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
  shadow: {
    none: 'none',
    xs: shadow('out', 0, 1, 2).colorize(ink(0.05)),
    sm: uniteShadows(
      shadow('out', 0, 2, 4).colorize(ink(0.06)),
      shadow('out', 0, 1, 2).colorize(ink(0.04)),
    ),
    md: uniteShadows(
      shadow('out', 0, 4, 12).colorize(ink(0.08)),
      shadow('out', 0, 1, 3).colorize(ink(0.04)),
    ),
    lg: uniteShadows(
      shadow('out', 0, 12, 28).colorize(ink(0.1)),
      shadow('out', 0, 2, 6).colorize(ink(0.05)),
    ),
    xl: uniteShadows(
      shadow('out', 0, 24, 56).colorize(ink(0.14)),
      shadow('out', 0, 4, 10).colorize(ink(0.06)),
    ),
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
  },
}
