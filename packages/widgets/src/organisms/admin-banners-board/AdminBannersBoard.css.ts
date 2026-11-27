import { style } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, truncate } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Верх списка: переключатель завершённых и пояснение, сколько скрыто. */
export const container = style({
  ...flexColumn(16),
})

export const toolbar = style({
  ...flexRow(16),
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
})

export const note = style({
  margin: 0,
  font: font('13/18'),
  color: color.text('muted'),
})

export const list = style({
  ...flexColumn(12),
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

/**
 * Строка - карточка, а не таблица: слайд, его состояние, выключатель и стрелки на
 * телефоне встают в столбик без горизонтальной прокрутки, а с `md` - в одну
 * строку: миниатюра, название и состояние, управление справа.
 */
export const row = style({
  ...flexColumn(12),
  padding: vars.space.md,
  backgroundColor: color.surface('base'),
  border: border(1, color.border('subtle')),
  borderRadius: vars.radius.xl,
  ...media({
    md: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rem(16),
    },
  }),
})

/** Строка, которую не показывает витрина, приглушена цветом текста, а не прозрачностью (она роняет контраст). */
export const rowMuted = style({
  backgroundColor: color.surface('sunken'),
})

export const thumb = style({
  position: 'relative',
  flex: '0 0 auto',
  width: '100%',
  aspectRatio: '3 / 2',
  overflow: 'hidden',
  borderRadius: vars.radius.md,
  backgroundColor: color.surface('soft'),
  ...media({
    md: { width: rem(120) },
  }),
})

export const thumbImage = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

/** Новость без картинки: плашка «Текст» на мягком фоне, как у текстового слайда. */
export const thumbText = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  font: font('13/18', 600),
  color: color.brand('700'),
})

export const main = style({
  ...flexColumn(6),
  flex: '1 1 auto',
  minWidth: 0,
})

export const heading = style({
  ...flexRow(8),
  alignItems: 'center',
  flexWrap: 'wrap',
  minWidth: 0,
})

export const title = style({
  ...truncate(),
  maxWidth: '100%',
  margin: 0,
  font: font('16/24', 600),
  color: color.text('primary'),
})

export const period = style({
  font: font('13/18'),
  color: color.text('secondary'),
})

export const controls = style({
  ...flexRow(12),
  flex: '0 0 auto',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  ...media({
    md: { justifyContent: 'flex-end' },
  }),
})

export const actions = style({
  ...flexRow(4),
  alignItems: 'center',
})
