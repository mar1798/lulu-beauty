/**
 * Фикстура для `styling.test.ts`: единственное место, где все миксины и
 * группы токенов реально прогоняются через vanilla-extract. Без неё ошибка
 * в миксине или в форме темы всплыла бы только при сборке первого компонента,
 * который их использует.
 *
 * Лежит в `styling/`, а не в `styling/mixin/`, чтобы не попасть в бочку
 * barrelsby и не уехать в публичный API пакета.
 */
import { style } from '@vanilla-extract/css'
import { color } from './lib'
import {
  container,
  containerPadding,
  flexColumn,
  flexRow,
  focusRing,
  focusVisibleRing,
  grid,
  gridAutoFit,
  lineClamp,
  truncate,
  visuallyHidden,
} from './mixin'
import { vars } from './themes/contract.css'

const COLUMNS = 3,
  GAP = 24,
  MIN_ITEM_WIDTH = 240,
  CLAMP_LINES = 2

export const layoutSmoke = style({
  ...container(),
  ...containerPadding(),
  ...flexColumn(GAP),
  ...flexRow(GAP),
  ...grid(COLUMNS, GAP),
  ...gridAutoFit(MIN_ITEM_WIDTH, GAP),
})

export const textSmoke = style({
  ...truncate(),
  ...lineClamp(CLAMP_LINES),
})

export const focusSmoke = style({
  ...focusRing(),
  ...focusVisibleRing(),
})

export const hiddenSmoke = style(visuallyHidden())

export const tokenSmoke = style({
  color: color.text('primary'),
  backgroundColor: color.surface('soft'),
  borderColor: color.border('subtle'),
  outlineColor: color.brand('500', 0.4),
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.md,
  zIndex: vars.zIndex.modal,
  padding: vars.space.lg,
  font: `400 1rem ${vars.font.eloqua}`,
})
