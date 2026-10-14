import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing, panel, visuallyHidden } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * Панель фотографий; в форме товара стоит в правой колонке, а в одну колонку —
 * над формой (порядок задаёт `AdminProductForm.css.ts`).
 */
export const container = style({
  ...flexColumn(16),
  ...panel(),
})

export const head = style(flexColumn(6))

/**
 * Группа — светлая подложка с рамкой: группы идут подряд, и без границы фото
 * соседних тонов сливались бы в одну ленту. Пунктир — потому что группа ещё
 * и место, куда бросают файлы.
 */
export const group = style({
  ...flexColumn(8),
  padding: vars.space.sm,
  border: `${rem(1)} dashed ${color.border('default')}`,
  borderRadius: vars.radius.lg,
  backgroundColor: color.surface('muted'),
  transition: 'border-color 120ms ease, background-color 120ms ease',
})

/** Над группой тащат файл — она подсвечивается: бросить можно сюда. */
export const groupOver = style({
  borderColor: color.border('focus'),
  backgroundColor: color.surface('soft'),
})

export const groupHead = style({
  ...flexRow(8),
  alignItems: 'baseline',
  justifyContent: 'space-between',
})

export const tiles = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${rem(88)}, 1fr))`,
  gap: vars.space.xs,
  listStyle: 'none',
  ...media({
    sm: { gridTemplateColumns: `repeat(auto-fill, minmax(${rem(112)}, 1fr))` },
  }),
})

export const tile = style({
  ...flexColumn(4),
  minWidth: 0,
})

/** Превью — кнопка: нажатие открывает окно фото. */
export const thumb = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  aspectRatio: '1 / 1',
  padding: 0,
  overflow: 'hidden',
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.md,
  backgroundColor: color.surface('base'),
  cursor: 'pointer',
  ...focusVisibleRing(),
  selectors: {
    '&:disabled': { cursor: 'default', opacity: 0.6 },
  },
})

export const thumbImage = style({
  // Фотография товара нигде не обрезается — см. `AppImage`/`components/Image.tsx`.
  objectFit: 'contain',
})

/** Метка «Главное» в углу превью. */
export const primaryMark = style({
  position: 'absolute',
  insetInlineStart: vars.space.xxs,
  insetBlockStart: vars.space.xxs,
  padding: `${rem(2)} ${rem(6)}`,
  font: font('11/14', 600),
  color: color.text('inverse'),
  backgroundColor: color.brand('500'),
  borderRadius: vars.radius.pill,
})

/** Карандаш в углу — подсказка, что превью нажимается. */
export const editMark = style({
  position: 'absolute',
  insetInlineEnd: vars.space.xxs,
  insetBlockEnd: vars.space.xxs,
  display: 'grid',
  placeItems: 'center',
  width: rem(24),
  height: rem(24),
  color: color.text('secondary'),
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.circle,
  boxShadow: vars.shadow.sm,
})

export const editIcon = style({
  width: rem(14),
  height: rem(14),
})

export const tileControls = style({
  ...flexRow(2),
  justifyContent: 'space-between',
})

/** Плитка «Добавить» — того же размера, что фото: место, где появится новое. */
export const addTile = style({
  ...flexColumn(2),
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  aspectRatio: '1 / 1',
  padding: vars.space.xxs,
  font: font('13/16', 600),
  color: color.text('brand'),
  textAlign: 'center',
  border: `${rem(1)} dashed ${color.border('strong')}`,
  borderRadius: vars.radius.md,
  backgroundColor: color.surface('base'),
  cursor: 'pointer',
  ...focusVisibleRing(),
  selectors: {
    '&:hover:not(:disabled)': { borderColor: color.border('focus') },
    '&:disabled': { cursor: 'default', opacity: 0.6 },
  },
})

export const addIcon = style({
  width: rem(20),
  height: rem(20),
})

/** «в „05 Rose“» под «Добавить» — мелко: куда попадёт фото. */
export const addTarget = style({
  maxWidth: '100%',
  overflow: 'hidden',
  font: font('11/14', 400),
  color: color.text('muted'),
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const preview = style({
  ...flexColumn(8),
  paddingTop: vars.space.sm,
  borderTop: border(1, color.border('subtle')),
})

/** Лента фото в порядке показа: прокручивается вбок, а не переносится — это порядок. */
export const previewStrip = style({
  ...flexRow(8),
  overflowX: 'auto',
  listStyle: 'none',
  paddingBottom: vars.space.xxs,
})

export const previewItem = style({
  position: 'relative',
  flex: `0 0 ${rem(72)}`,
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.sm,
  backgroundColor: color.surface('base'),
})

export const input = style(visuallyHidden())

/* --- Окно фото --- */

export const editor = style({
  ...flexColumn(16),
  ...media({
    sm: {
      display: 'grid',
      gridTemplateColumns: `${rem(160)} minmax(0, 1fr)`,
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

export const editorImage = style({
  position: 'relative',
  width: '100%',
  maxWidth: rem(200),
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.md,
})

export const editorFields = style(flexColumn(16))

export const field = style(flexColumn(8))

export const chips = style({
  ...flexRow(6),
  flexWrap: 'wrap',
})

export const checks = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${rem(140)}, 1fr))`,
  gap: vars.space.xs,
})

export const editorActions = style({
  ...flexRow(8),
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
})

export const editorActionsEnd = style({
  ...flexRow(8),
  marginInlineStart: 'auto',
})
