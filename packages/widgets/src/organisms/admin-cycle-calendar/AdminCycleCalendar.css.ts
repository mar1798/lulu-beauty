import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(20),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)',
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

const panel = {
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
} as const

export const calendar = style({
  ...flexColumn(16),
  ...panel,
})

export const head = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'space-between',
})

const weekGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: rem(6),
} as const

export const weekdays = style(weekGrid)

export const weekday = style({
  font: font('12/18', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  color: color.text('muted'),
  textAlign: 'center',
})

export const grid = style(weekGrid)

export const blank = style({})

export const day = style([
  {
    ...flexColumn(4),
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: rem(72),
    padding: rem(6),
    backgroundColor: color.surface('muted'),
    border: border(1, 'transparent'),
    borderRadius: vars.radius.md,
    cursor: 'pointer',
    transition: transition('background-color', 'border-color'),
    selectors: {
      '&:hover': { backgroundColor: color.surface('soft') },
    },
  },
  focusVisibleRing(),
])

/**
 * Прошедший день приглушён, но кликабелен: назначить на него сбор бэкенд не
 * даст (`deadline_must_be_future`), а вот открыть и удалить прошлый — можно.
 *
 * Приглушается подложка и число, а не весь день через `opacity`: прозрачность
 * смешивала с фоном и текст бейджа со временем, роняя контраст до 3.13:1
 * (поймано axe на живой странице).
 */
export const dayPast = style({
  backgroundColor: color.surface('sunken'),
})

export const dayToday = style({
  borderColor: color.border('strong'),
})

export const daySelected = style({
  backgroundColor: color.surface('soft'),
  borderColor: color.border('focus'),
})

export const dayNumber = style({
  font: font('14/20', 600),
  color: color.text('primary'),
  fontVariantNumeric: 'tabular-nums',
})

export const dayNumberPast = style({
  color: color.text('muted'),
})

export const dayCycle = style({
  display: 'block',
  maxWidth: '100%',
})

export const editor = style({
  ...flexColumn(12),
  ...panel,
  alignItems: 'stretch',
})

export const statusRow = style({
  ...flexColumn(6),
})

export const editorActions = style({
  ...flexRow(8),
  flexWrap: 'wrap',
})
