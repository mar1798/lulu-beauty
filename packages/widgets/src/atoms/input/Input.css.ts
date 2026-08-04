import { globalStyle, style } from '@vanilla-extract/css'
import { color } from '../../styling/lib'
import {
  fieldError,
  fieldHint,
  fieldInput,
  fieldInvalid,
  fieldLabel,
  fieldShell,
  flexColumn,
} from '../../styling/mixin'

export const container = style(flexColumn(6))

export const label = style(fieldLabel())

export const shell = style(fieldShell())

export const invalid = style(fieldInvalid())

export const disabled = style({
  backgroundColor: color.surface('sunken'),
  color: color.text('muted'),
  cursor: 'not-allowed',
})

export const input = style(fieldInput())

/**
 * У `type="search"` WebKit рисует собственный крестик очистки. Рядом с нашим
 * суффиксом (`SearchField`) получались две кнопки подряд, поэтому нативную
 * гасим — она всё равно не поддаётся стилизации.
 */
globalStyle(`${input}[type="search"]::-webkit-search-cancel-button`, {
  display: 'none',
})

/** Префикс/суффикс: иконка или статичный текст вроде «+996». */
export const affix = style({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  color: color.text('muted'),
})

export const hint = style(fieldHint())

export const error = style(fieldError())
